import React, { useEffect, useState } from "react";
import VideoPlayer from "../VideoPlayer.jsx";
import { prepareUploadVideo, getProgress, getSourceVideoUrl, initSam, setAnnotationMode } from "../api.js";
import { ANNOTATION_MODES } from "../behaviorLabels.js";
import { BACKEND } from "../backendConfig.js";

export default function VideoSelectionPage({
  onVideoLoaded,
  onInitialized,
  onResumeSession,
  connectionStatus,
  defaultResumeRunId = "",
  annotationMode = ANNOTATION_MODES.STANDARD,
  onAnnotationModeChange,
}) {
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(false);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [error, setError] = useState("");
  const [videoInfo, setVideoInfo] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [uploadedFileName, setUploadedFileName] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [prompt, setPrompt] = useState("cow");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadMessage, setUploadMessage] = useState("");
  const [resumeRunId, setResumeRunId] = useState(defaultResumeRunId || "");

  useEffect(() => {
    setResumeRunId(defaultResumeRunId || "");
  }, [defaultResumeRunId]);

  // Keep server meta in sync when user toggles mode after upload
  useEffect(() => {
    const rid = videoInfo?.runId;
    if (!rid) return;
    setAnnotationMode(rid, annotationMode).catch((e) => {
      console.warn("[VideoSelectionPage] annotation mode sync failed:", e);
    });
  }, [annotationMode, videoInfo?.runId]);

  const handleUploadFile = async (file) => {
    if (!file) return;
    setLoading(true);
    setError("");
    setVideoInfo(null);
    setVideoUrl(null);
    setUploadedFileName(null);
    setUploadProgress(0);
    setUploadMessage("Starting upload...");
    
    try {
      const result = await prepareUploadVideo(file, (progress, message, stage) => {
        console.log("[VideoSelectionPage] Progress callback:", progress, message, stage);
        setUploadProgress(progress);
        setUploadMessage(message || "");
      });
      setVideoInfo({
        path: result.uploaded_filename || file.name,
        resolution:
          result.width && result.height ? `${result.width}×${result.height}` : "Unknown",
        fps: result.fps ? String(result.fps) : "Unknown",
        frames: result.n_frames_total ? String(result.n_frames_total) : "Unknown",
        runId: result.run_id,
      });
      setUploadedFileName(result.uploaded_filename || file.name);
      setVideoUrl(getSourceVideoUrl(result.run_id) + `?t=${Date.now()}`);
      setUploadProgress(100);
      setUploadMessage("Completed");

      try {
        await setAnnotationMode(result.run_id, annotationMode);
      } catch (modeErr) {
        console.warn("[VideoSelectionPage] Could not set annotation mode:", modeErr);
      }

      onVideoLoaded?.({
        videoPath: result.uploaded_filename || file.name,
        runId: result.run_id,
        annotationMode,
      });
    } catch (e) {
      setError(`Failed to upload video: ${e.message}`);
      setUploadProgress(0);
      setUploadMessage("");
    } finally {
      setLoading(false);
      // Clear progress after a moment
      setTimeout(() => {
        setUploadProgress(0);
        setUploadMessage("");
      }, 1000);
    }
  };

  const handleInitializeSam = async () => {
    if (!videoInfo?.runId) return;
    if (!prompt.trim()) {
      setError("Please enter a text prompt (e.g. 'cow').");
      return;
    }
    setInitLoading(true);
    setError("");
    try {
      const result = await initSam(videoInfo.runId, prompt.trim());
      onInitialized?.(result);
    } catch (e) {
      setError(`Failed to initialize with SAM: ${e.message}`);
    } finally {
      setInitLoading(false);
    }
  };

  const handleResume = async () => {
    const rid = (resumeRunId || "").trim();
    if (!rid) {
      setError("Please enter a run id.");
      return;
    }
    setResumeLoading(true);
    setError("");
    try {
      const prog = await getProgress(rid);

      // Populate preview panel (source video) so user can init SAM if needed
      setVideoInfo({
        path: "(existing session)",
        resolution: "Unknown",
        fps: prog.fps ? String(prog.fps) : "Unknown",
        frames: prog.total_frames ? String(prog.total_frames) : "Unknown",
        runId: prog.run_id || rid,
      });
      setVideoUrl(getSourceVideoUrl(rid) + `?t=${Date.now()}`);

      if (prog.annotation_mode && onAnnotationModeChange) {
        onAnnotationModeChange(prog.annotation_mode);
      }

      onResumeSession?.(rid);
    } catch (e) {
      setError(`Could not resume session: ${e.message}`);
    } finally {
      setResumeLoading(false);
    }
  };

  return (
    <div style={{ 
      minHeight: "100vh", 
      background: "linear-gradient(180deg, #f8f9fa 0%, #ffffff 100%)",
      padding: "32px 24px"
    }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.3, color: "#212529" }}>
            JISTBA
          </div>

          {connectionStatus !== null && (
            <div
              title={connectionStatus ? "Backend connected" : "Backend not reachable"}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 12px",
                borderRadius: 999,
                border: `1px solid ${connectionStatus ? "#b7e4c7" : "#f1b0b7"}`,
                background: connectionStatus ? "#eaf7ef" : "#fdecee",
                color: connectionStatus ? "#1b4332" : "#842029",
                fontSize: 12,
                fontWeight: 600,
                userSelect: "none",
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 999,
                  background: connectionStatus ? "#2ecc71" : "#e74c3c",
                  boxShadow: connectionStatus ? "0 0 0 2px rgba(46, 204, 113, 0.2)" : "0 0 0 2px rgba(231, 76, 60, 0.2)",
                }}
              />
              {connectionStatus ? "Connected" : "Offline"}
            </div>
          )}
        </div>

        {/* Only show big alert if offline */}
        {connectionStatus === false && (
          <div
            style={{
              padding: 14,
              marginBottom: 24,
              backgroundColor: "#fdecee",
              border: "1px solid #f1b0b7",
              borderRadius: 12,
              color: "#842029",
              fontSize: 13,
              lineHeight: 1.5,
            }}
          >
            Backend is not reachable at <code>{BACKEND}</code> (mode <code>{import.meta.env.MODE}</code>).
            {import.meta.env.MODE === "ssh" ? (
              <>
                {" "}
                Check that the backend is running on the server and the{" "}
                <code>ssh -N -L 12212:localhost:12212 …</code> tunnel is still open, then refresh.
              </>
            ) : import.meta.env.MODE === "pinggy" ? (
              <>
                {" "}
                Check that the Pinggy tunnel is still running and <code>frontend/.env.pinggy</code>{" "}
                has the current URL, then restart <code>npm run dev:pinggy</code>.
              </>
            ) : (
              <>
                {" "}
                Start the backend locally, or use <code>npm run dev</code> (SSH tunnel) or{" "}
                <code>npm run dev:pinggy</code>.
              </>
            )}
          </div>
        )}

        <div
          style={{
            backgroundColor: "#fff",
            border: "1px solid #e9ecef",
            borderRadius: 16,
            padding: 32,
            boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ marginBottom: 28 }}>
            <h1 style={{ 
              fontSize: 24, 
              fontWeight: 700, 
              margin: 0,
              color: "#212529",
              letterSpacing: -0.2
            }}>
              Upload Video
            </h1>
          </div>

          {/* Annotation mode */}
          <div
            style={{
              marginBottom: 20,
              padding: 16,
              borderRadius: 12,
              border: "1px solid #e9ecef",
              background: "#f8f9fa",
            }}
          >
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "#495057" }}>
              ANNOTATION MODE
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <label
                style={{
                  flex: "1 1 200px",
                  padding: 12,
                  borderRadius: 10,
                  border: `2px solid ${annotationMode === ANNOTATION_MODES.STANDARD ? "#0d6efd" : "#dee2e6"}`,
                  background: annotationMode === ANNOTATION_MODES.STANDARD ? "#e7f1ff" : "#fff",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                <input
                  type="radio"
                  name="annotationMode"
                  checked={annotationMode === ANNOTATION_MODES.STANDARD}
                  onChange={() => onAnnotationModeChange?.(ANNOTATION_MODES.STANDARD)}
                  style={{ marginRight: 8 }}
                />
                <strong>Standard VOS</strong>
                <div style={{ color: "#6c757d", marginTop: 4 }}>Masks and tracking only (current workflow).</div>
              </label>
              <label
                style={{
                  flex: "1 1 200px",
                  padding: 12,
                  borderRadius: 10,
                  border: `2px solid ${annotationMode === ANNOTATION_MODES.BEHAVIOR ? "#0d6efd" : "#dee2e6"}`,
                  background: annotationMode === ANNOTATION_MODES.BEHAVIOR ? "#e7f1ff" : "#fff",
                  cursor: "pointer",
                  fontSize: 13,
                }}
              >
                <input
                  type="radio"
                  name="annotationMode"
                  checked={annotationMode === ANNOTATION_MODES.BEHAVIOR}
                  onChange={() => onAnnotationModeChange?.(ANNOTATION_MODES.BEHAVIOR)}
                  style={{ marginRight: 8 }}
                />
                <strong>Behaviour annotation</strong>
                <div style={{ color: "#6c757d", marginTop: 4 }}>Masks + behaviour labels per cow.</div>
              </label>
            </div>
          </div>

          {/* Resume session */}
          <div
            style={{
              marginBottom: 18,
              padding: 16,
              borderRadius: 16,
              border: "1px solid #e9ecef",
              background: "linear-gradient(180deg, #ffffff, #fbfcfe)",
              boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 10, color: "#212529" }}>
              Continue a session
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <input
                value={resumeRunId}
                onChange={(e) => setResumeRunId(e.target.value)}
                placeholder="e.g. 20260204_231134_74fe5f"
                disabled={loading || initLoading || resumeLoading || connectionStatus === false}
                style={{
                  flex: "1 1 320px",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #dee2e6",
                  fontSize: 14,
                  outline: "none",
                }}
              />
              <button
                onClick={handleResume}
                disabled={loading || initLoading || resumeLoading || connectionStatus === false || !resumeRunId.trim()}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "none",
                  fontSize: 14,
                  fontWeight: 700,
                  background: (loading || initLoading || resumeLoading || connectionStatus === false || !resumeRunId.trim())
                    ? "#e9ecef"
                    : "linear-gradient(135deg, #0d6efd 0%, #4dabf7 100%)",
                  color: (loading || initLoading || resumeLoading || connectionStatus === false || !resumeRunId.trim())
                    ? "#adb5bd"
                    : "white",
                  cursor: (loading || initLoading || resumeLoading || connectionStatus === false || !resumeRunId.trim())
                    ? "not-allowed"
                    : "pointer",
                  boxShadow: (loading || initLoading || resumeLoading || connectionStatus === false || !resumeRunId.trim())
                    ? "none"
                    : "0 8px 18px rgba(13, 110, 253, 0.22)",
                }}
              >
                {resumeLoading ? "Checking..." : "Continue"}
              </button>
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "#6c757d", lineHeight: 1.4 }}>
              Tip: you can find the <code>run_id</code> in server logs or in the downloaded golden zip filename.
            </div>
          </div>

        {/* Main content: always 2-column layout */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.6fr 1fr",
            gap: 18,
            alignItems: "start",
          }}
        >
          {/* Left: upload area or video */}
          <div>
            {videoUrl ? (
              <VideoPlayer videoUrl={videoUrl} label="" height={520} />
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!loading && connectionStatus) setIsDragging(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDragging(false);
                  if (loading || !connectionStatus) return;
                  const files = Array.from(e.dataTransfer.files || []);
                  const f = files[0];
                  if (f) handleUploadFile(f);
                }}
                style={{
                  position: "relative",
                  height: 520,
                  padding: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  border: `2px dashed ${isDragging ? "#28a745" : "#dee2e6"}`,
                  borderRadius: 16,
                  background: isDragging 
                    ? "linear-gradient(180deg, #e8f5e9, #f1f8f4)" 
                    : "linear-gradient(180deg, #ffffff, #f8f9fa)",
                  textAlign: "center",
                  transition: "all 0.25s ease",
                  cursor: loading || !connectionStatus ? "not-allowed" : "pointer",
                  opacity: loading ? 0.7 : 1,
                  transform: isDragging ? "scale(1.01)" : "scale(1)",
                }}
              >
                <div style={{ padding: 40, width: "100%", maxWidth: 400 }}>
                  <div style={{ 
                    fontSize: 48, 
                    marginBottom: 16, 
                    opacity: 0.6,
                    lineHeight: 1 
                  }}>
                    📹
                  </div>
                  <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 18, color: "#212529" }}>
                    {loading
                      ? "Uploading & extracting frames…"
                      : isDragging
                        ? "Drop to upload"
                        : "Drop video here"}
                  </div>
                  <div style={{ fontSize: 14, color: "#6c757d", marginBottom: 8 }}>
                    {loading ? (uploadMessage || "This may take a while for longer videos.") : "or click to browse"}
                  </div>
                  {loading && (
                    <div style={{ 
                      width: "100%", 
                      height: 8, 
                      backgroundColor: "#e9ecef", 
                      borderRadius: 4,
                      overflow: "hidden",
                      marginBottom: 12
                    }}>
                      <div style={{
                        height: "100%",
                        width: `${uploadProgress}%`,
                        backgroundColor: "#28a745",
                        borderRadius: 4,
                        transition: "width 0.3s ease"
                      }} />
                    </div>
                  )}
                  {loading && uploadProgress > 0 && (
                    <div style={{ fontSize: 12, color: "#6c757d", marginBottom: 8 }}>
                      {Math.round(uploadProgress)}%
                    </div>
                  )}
                  <div style={{ fontSize: 12, color: "#adb5bd" }}>Supported: mp4, mov, avi, mkv</div>
                </div>
                <input
                  type="file"
                  accept="video/*,.mp4,.mov,.avi,.mkv"
                  disabled={loading || !connectionStatus}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUploadFile(f);
                  }}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    opacity: 0,
                    cursor: loading || !connectionStatus ? "not-allowed" : "pointer",
                  }}
                />
              </div>
            )}
          </div>

          {/* Right: video info + CTA */}
          <div style={{ height: 520, display: "flex", flexDirection: "column" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
              <div
                style={{
                  border: "1px solid #e9ecef",
                  borderRadius: 16,
                  padding: 20,
                  background: "#ffffff",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
                }}
              >
                <div style={{ 
                  fontSize: 14, 
                  fontWeight: 600, 
                  color: "#495057", 
                  marginBottom: 16,
                  letterSpacing: 0.3
                }}>
                  VIDEO INFORMATION
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {[
                    { label: "File", value: videoInfo?.path || "—" },
                    { label: "Resolution", value: videoInfo?.resolution || "—" },
                    { label: "FPS", value: videoInfo?.fps || "—" },
                    { label: "Frames", value: videoInfo?.frames || "—" },
                  ].map((item) => (
                    <div
                      key={item.label}
                      style={{
                        border: "1px solid #f1f3f5",
                        background: videoInfo ? "linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)" : "#fbfcfd",
                        borderRadius: 12,
                        padding: "14px 12px",
                        height: 60,
                        transition: "all 0.2s ease",
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                      }}
                    >
                      <div style={{ 
                        fontSize: 10, 
                        color: "#6c757d", 
                        fontWeight: 600, 
                        marginBottom: 6,
                        letterSpacing: 0.5,
                        textTransform: "uppercase"
                      }}>
                        {item.label}
                      </div>
                      <div style={{ 
                        fontSize: 15, 
                        color: videoInfo ? "#212529" : "#adb5bd", 
                        fontWeight: 600,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        lineHeight: 1.4,
                        wordBreak: "break-word"
                      }}>
                        {item.value}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Prompt */}
              <div
                style={{
                  border: "1px solid #e9ecef",
                  borderRadius: 16,
                  padding: 16,
                  background: "#ffffff",
                  boxShadow: "0 2px 12px rgba(0,0,0,0.05)",
                }}
              >
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: "#495057",
                    marginBottom: 10,
                    letterSpacing: 0.3,
                  }}
                >
                  SAM TEXT PROMPT
                </div>
                <input
                  type="text"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="cow"
                  disabled={loading || initLoading || !videoInfo?.runId}
                  style={{
                    width: "100%",
                    padding: "12px 12px",
                    border: "1px solid #dee2e6",
                    borderRadius: 12,
                    fontSize: 14,
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Initialize button */}
              <button
                onClick={handleInitializeSam}
                disabled={loading || initLoading || !videoInfo?.runId || !prompt.trim()}
                onMouseEnter={(e) => {
                  if (!loading && !initLoading && videoInfo?.runId && prompt.trim()) {
                    e.currentTarget.style.transform = "translateY(-1px)";
                    e.currentTarget.style.boxShadow = "0 12px 24px rgba(40, 167, 69, 0.35)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading && !initLoading && videoInfo?.runId && prompt.trim()) {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow = "0 8px 18px rgba(40, 167, 69, 0.25)";
                  }
                }}
                style={{
                  marginTop: 0,
                  padding: "14px 20px",
                  fontSize: 16,
                  fontWeight: 600,
                  background: loading || initLoading || !videoInfo?.runId || !prompt.trim()
                    ? "#e9ecef" 
                    : "linear-gradient(135deg, #28a745 0%, #20c997 100%)",
                  color: loading || initLoading || !videoInfo?.runId || !prompt.trim() ? "#adb5bd" : "white",
                  border: "none",
                  borderRadius: 12,
                  cursor: loading || initLoading || !videoInfo?.runId || !prompt.trim() ? "not-allowed" : "pointer",
                  width: "100%",
                  boxShadow: loading || initLoading || !videoInfo?.runId || !prompt.trim()
                    ? "none" 
                    : "0 8px 18px rgba(40, 167, 69, 0.25)",
                  transition: "all 0.2s ease",
                  transform: "translateY(0)",
                }}
              >
                {initLoading ? "Initializing with SAM…" : "Initialize with SAM"}
              </button>

              {/* Error message */}
              {error && (
                <div
                  style={{
                    padding: 12,
                    backgroundColor: "#fdecee",
                    border: "1px solid #f1b0b7",
                    borderRadius: 12,
                    color: "#842029",
                    fontSize: 13,
                    lineHeight: 1.35,
                  }}
                >
                  {error}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
