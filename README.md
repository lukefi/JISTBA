# JISTBA: Joint Instance Segmentation, Tracking and Behaviour Annotation

JISTBA is a web-based annotation tool for videos of animals. It uses SAM-3 for instance segmentation (mask initialization), XMem for tracking the instances across frames, and supports per-animal behaviour annotation on a timeline.

## Overview

This application provides an interactive interface for:
- Uploading and processing videos
- Initializing masks using SAM-3 with text prompts
- Tracking objects across video frames using XMem
- Correcting and refining masks interactively
- Annotating behaviour per cow on a timeline (behaviour annotation mode)
- Exporting annotation results

For a description of the app and a step-by-step guide to the annotation workflow, see the user manual [`JISTBA-manual.pdf`](JISTBA-manual.pdf). This README covers installation and setup.

The repository has two independent parts:

- **`backend/`** – FastAPI server (`server.py`), its Python dependencies and config. This is the part that runs on the GPU machine; you can copy just this folder to a server.
- **`frontend/`** – React + Vite UI. Runs on the annotator's machine and talks to the backend over HTTP.

## Prerequisites

### System Requirements
- Python 3.11 or higher (backend)
- Node.js 16+ and npm (frontend)
- CUDA-capable GPU (recommended for SAM-3 and XMem)
- **ffmpeg** (for video processing) - must be installed or loaded as a module

### External Dependencies (backend)
- **SAM-3**: Segment Anything Model 3 (must be installed as a Python package)
- **XMem**: XMem tracking repository (cloned to `backend/XMem` by default)
- **XMem Model**: `XMem.pth`, by default at `backend/XMem/saves/XMem.pth`

## Backend Installation

All backend commands below are run from inside the `backend/` folder.

```bash
git clone <repository-url>
cd vos-annoation_app/backend
```

### 1. Load Required Modules (Cluster/HPC Systems)

> **Note:** The installation can differ depending on the cluster you use: module names, versions, GPU architecture and preinstalled packages vary. Check what is available with `module avail` / `module spider`. If you run into errors, it helps to discuss them (together with your cluster's documentation and the list of available modules) with an LLM assistant.

On cluster systems, you may need to load modules first. **Python 3.11 or higher is recommended:**

```bash
module avail python          # or: module spider python
module load python/3.11      # or python/3.12, python3
module load ffmpeg           # required for video processing
```

Some clusters provide PyTorch as a module built for their hardware. For example, on CSC Roihu (GH200 GPU nodes):

```bash
# Load the GH200 optimized PyTorch module
module load python-pytorch/2.13
```

If you load a PyTorch module, create the virtual environment with `--system-site-packages` (step 2) so it can see the module's PyTorch, and skip step 3.

### 2. Create Python Virtual Environment

```bash
python3 -m venv venv         # with a PyTorch module: python3 -m venv --system-site-packages venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 3. Install PyTorch (Required for SAM-3)

Skip this step if PyTorch comes from a cluster module (step 1). Otherwise, SAM-3 requires PyTorch. Install it before installing SAM-3:

```bash
python3 -m pip install --upgrade pip

# Adjust the CUDA version (cu126, cu121, etc.) to your system.
# See https://pytorch.org/get-started/locally/ for the correct command.
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu126
```

### 4. Install SAM-3

SAM-3 must be installed as a Python package:

```bash
# If git is not available, download as ZIP: wget https://github.com/facebookresearch/sam3/archive/refs/heads/main.zip
git clone https://github.com/facebookresearch/sam3.git sam3
cd sam3
pip install -e .
cd ..
```

**Note**: The SAM 3 checkpoints are gated. Request access on the [SAM 3 Hugging Face page](https://huggingface.co/facebook/sam3), then provide a Hugging Face token for the first download:

```bash
export HUGGINGFACE_HUB_TOKEN="your_token_here"
```

### 5. Install XMem

```bash
# Clone XMem into backend/XMem
git clone https://github.com/hkchengrex/XMem.git

# Download the model (see https://github.com/hkchengrex/XMem/releases)
mkdir -p XMem/saves
wget -O XMem/saves/XMem.pth https://github.com/hkchengrex/XMem/releases/download/v1.0/XMem.pth

# Install XMem dependencies
pip install -r XMem/requirements.txt

# Verify
ls -la XMem/eval.py XMem/saves/XMem.pth
```

XMem can live elsewhere – set `xmem_repo` / `xmem_model` in `config/paths.local.json` (see [Path Configuration](#path-configuration)).

### 6. Install Python Dependencies

```bash
pip install -r requirements.txt
```

If PyTorch comes from a cluster module, note that `requirements.txt` pins `torch`, `torchvision`, `torchaudio` and the `nvidia-*` CUDA packages (x86 / CUDA 12.6 builds). Installing them would override the module's PyTorch, so remove those lines from a copy of the file first, or install the remaining packages individually as needed.

## Frontend Installation

```bash
cd frontend
npm install
```

## Configuration

### Path Configuration (backend)

Backend paths are defined in `backend/config/paths.json`. Relative paths are resolved against the `backend/` folder:

- `runs_root` (default `runs`): where runs (frames, masks, golden output) are stored
- `torch_cache_dir` (default `cache/torch`): `TORCH_HOME` for XMem's pretrained weights
- `tmp_dir` (default `cache/tmp`): temporary files (XMem, golden zip downloads)
- `xmem_repo` / `xmem_model` (default `XMem`, `XMem/saves/XMem.pth`)
- `ffmpeg_module` (default `null`): if ffmpeg is not on `PATH`, run `module load <name>` at startup (HPC clusters)

To override paths on one machine, create `backend/config/paths.local.json` (git-ignored) with only the keys you want to change. `backend/config/paths.local.example.json` shows a CSC/Puhti setup using `/scratch`. Set the `VOS_PATHS_CONFIG` environment variable to use an override file at a different location.

The server refuses to start if `runs_root` is not writable or the override file contains an unknown key.

### Behaviour Labels

Behaviour labels (three label dimensions with titles, label names, descriptions and defaults) are read by both the backend and the frontend from:

1. `backend/config/behavior_labels.local.json` if it exists (git-ignored, for your project's own labels), otherwise
2. `backend/config/behavior_labels.json`, which contains generic English placeholder labels.

#### Using your own behaviours

1. Copy the placeholder file:
   ```bash
   cp backend/config/behavior_labels.json backend/config/behavior_labels.local.json
   ```
2. In `behavior_labels.local.json`, replace the placeholder labels with your own. Each label has a stable `id` (stored in annotations), a display name and a description shown to annotators:
   ```json
   {
     "id": "ruminate",
     "name_fi": "Ruminating",
     "description_fi": "The cow chews cud with rhythmic jaw movements."
   }
   ```
   Labels in `label2` can also have a `group_fi`, used to group labels in the reference list.
3. Optionally rename the dimensions via `title_fi` (full title) and `short_title_fi` (timeline row label), and set each dimension's `default_label`.
4. Restart the backend and the frontend. The backend refuses to start and names the problem if the file breaks one of the rules below.
5. Give the same file to every machine that runs the backend or the frontend (it is git-ignored, so it is not shared through the repository).

Rules:

- The three dimensions `activity`, `label2`, `label3` must all exist.
- Some ids are required because the code relies on them: `not_visible` in `activity`, `none` and `not_seen` in `label2`, `none` in `label3`.
- `default_label` must be one of the dimension's label ids; `short_title_fi` is the short name shown on the timeline rows.
- The `*_fi` field names are historical; the values can be in any language.
- Label `id`s are stored in run annotation files, so rename names/descriptions freely but avoid changing or removing ids used by existing runs.

Restart the backend and `npm run dev` after editing. The backend and the frontend must use the same label file: if the backend runs from a copied `backend/` folder on a server, put the same `behavior_labels.local.json` there and in your local repo. The env variable `BEHAVIOR_LABELS_CONFIG` overrides the backend's file location.

### Environment Variables (backend)

- `HUGGINGFACE_HUB_TOKEN`: (Optional) Hugging Face token for downloading gated SAM-3 models.
- `VOS_PATHS_CONFIG`: (Optional) path to a paths override file.
- `BEHAVIOR_LABELS_CONFIG`: (Optional) path to an alternative behaviour labels file.

### Backend URL (frontend)

The frontend connects to `http://127.0.0.1:12212` by default, i.e. a backend on the same machine or reached through an SSH tunnel:

```bash
# e.g. Puhti compute node forwarded to your laptop
ssh -N -L 12212:<compute-node>:12212 <user>@puhti.csc.fi
```

To use a remote URL (e.g. a Pinggy / localhost.run tunnel), create `frontend/.env`. On macOS, create it from the terminal, since Finder can't create files whose names start with a dot:

```bash
cd frontend
./setup-env.sh https://your-tunnel.pinggy.link [USER] [PASSWORD]
```

This writes `VITE_API_URL` and, if given, `VITE_API_USER` / `VITE_API_PASSWORD` for tunnel basic auth. In dev, requests to a remote URL go through the Vite proxy at `/api`. See `frontend/.env.example`. Restart `npm run dev` after changing `.env`.

## Running the Application

### 1. Start the Backend Server

From the `backend/` folder, with the virtual environment activated:

```bash
cd backend
python -m uvicorn server:app --host 0.0.0.0 --port 12212 --log-level info
```

Add `--reload` for auto-reload during development. On HPC systems either `module load ffmpeg` first or set `ffmpeg_module` in `config/paths.local.json`.

`uvicorn server:app` must be run from inside `backend/` (or pass `--app-dir backend` from the repo root).

### 2. Start the Frontend Development Server

In a separate terminal:

```bash
cd frontend
npm run dev
```

The frontend runs on `http://localhost:5173`. Open it in your browser.

## Deploying the Backend to a Server

1. Copy the `backend/` folder to the server (e.g. `rsync -av backend/ user@server:vos-backend/`).
2. On the server, follow [Backend Installation](#backend-installation) inside that folder (venv, PyTorch, SAM-3, XMem, `requirements.txt`).
3. Create `config/paths.local.json` if the defaults don't fit, e.g. on Puhti point `runs_root`, `torch_cache_dir` and `tmp_dir` to `/scratch/project_<N>/...` and set `ffmpeg_module` to `"ffmpeg"`.
4. Start the server from that folder and point the frontend at it (SSH tunnel or `frontend/.env`).

The frontend stays on your machine, and it still needs `backend/config/behavior_labels.json` (and your `behavior_labels.local.json`, if you use one) from the full repo.

## Usage

1. **Upload Video**: Drag and drop a video file or select one from the interface
2. **Initialize with SAM**: Enter a text prompt (e.g., "cow") and click "Initialize with SAM"
3. **Assign IDs**: Review detected masks and assign IDs to objects
4. **Track**: Click "Track" to track objects across frames using XMem
5. **Correct**: Use the correction tools to refine masks interactively
6. **Behaviour (optional)**: In behaviour mode, label each cow on the timeline in the Golden tab
7. **Export**: Download the final annotations

## Project Structure

```
vos-annoation_app/
├── backend/
│   ├── server.py                     # Entry point: FastAPI app, middleware, startup, routers
│   ├── requirements.txt              # Python dependencies
│   ├── vos/
│   │   ├── config.py                 # Paths (config/paths*.json) and constants
│   │   ├── state.py                  # In-memory upload / tracking progress
│   │   ├── storage.py                # Run directory layout, frame / mask / meta loading
│   │   ├── behavior.py               # Behaviour label catalog and per-cow segments
│   │   ├── overlay.py                # Drawing masks, IDs and behaviour labels on frames
│   │   ├── segmentation.py           # SAM-3 models, instance extraction, ID matching
│   │   ├── video.py                  # ffmpeg: frame extraction, rendering, concatenation
│   │   ├── tracking.py               # XMem: chunk datasets, running XMem, output masks
│   │   ├── schemas.py                # Pydantic request payloads
│   │   └── routes/                   # API endpoints grouped by feature
│   │       ├── upload.py             # /prepare, /prepare_upload, upload progress
│   │       ├── init_ids.py           # /init_sam, /match_init_ids, /preview_init_update, /apply_init_ids
│   │       ├── tracking.py           # /track, /commit, /track_progress, /progress, /get_frame_from_time
│   │       ├── frames.py             # /frame0, /frame, /tracked_frame
│   │       ├── correction.py         # /prepare_correction, /preview_correction_update, /apply_correction, /correct_frame
│   │       ├── mask_editing.py       # /add_mask, /refine_mask
│   │       ├── behavior.py           # /behavior/*, annotation mode, golden preview rebuild
│   │       └── results.py            # /result, /golden_video, /source, /paths, /download_golden
│   ├── config/
│   │   ├── paths.json                # Default paths
│   │   ├── paths.local.example.json  # Example per-machine override (CSC/Puhti)
│   │   ├── behavior_labels.json      # Placeholder behaviour labels (shared with frontend)
│   │   └── behavior_labels.local.json  # Your own labels (git-ignored, optional)
│   ├── XMem/                         # XMem repository (cloned, not in git)
│   │   └── saves/XMem.pth            # XMem model file (downloaded)
│   └── runs/                         # Default runs_root (created at runtime)
├── frontend/
│   ├── src/
│   │   ├── api.js                    # API client
│   │   ├── backendConfig.js          # Backend URL / auth from .env
│   │   ├── behaviorLabels.js         # Reads backend/config/behavior_labels(.local).json
│   │   ├── App.jsx
│   │   └── pages/
│   ├── .env.example
│   ├── setup-env.sh                  # Creates frontend/.env
│   ├── package.json
│   └── vite.config.js
├── scripts/                          # Helper scripts for tunnels / WSL startup
└── JISTBA-manual.pdf                 # User manual: app overview and annotation workflow
```

## Troubleshooting

### SAM-3 Import Errors
- Ensure SAM-3 is installed as a package: `pip install -e sam3/`
- Verify Python can import: `python -c "from sam3.model_builder import build_sam3_image_model"`

### XMem Errors
- Verify the XMem repository is at `backend/XMem` (or `xmem_repo` in `paths.local.json`)
- Check that `XMem/saves/XMem.pth` exists (or `xmem_model`)
- Ensure XMem dependencies are installed

### GPU Issues
- Verify CUDA: `python -c "import torch; print(torch.cuda.is_available())"`
- SAM-3 and XMem will fall back to CPU if GPU is unavailable (much slower)

### Frontend shows "Offline"
- Check the backend is running: open `<backend-url>/health`, which should return `{"status":"ok",...}`
- Check `VITE_API_URL` in `frontend/.env` and restart `npm run dev`
- The browser console logs which backend URL the frontend uses (`[API] Backend: ...`)

### Port Conflicts
- Change backend port: `uvicorn server:app --port <different-port>`, then update `VITE_API_URL` / your SSH tunnel
- Change frontend port in `frontend/vite.config.js`

### Storage Issues
- Set `runs_root` in `backend/config/paths.local.json` to a location with sufficient space
- Videos and extracted frames can take significant disk space

## Development

- Backend API docs: `http://localhost:12212/docs` (FastAPI auto-docs)
- Frontend uses Vite hot module replacement; components are in `frontend/src/`


## Acknowledgements

This tool relies on the following models. If you use it in research, please cite them.

**SAM 3** (Meta AI) is used for text-prompted mask initialization and mask refinement.
[GitHub](https://github.com/facebookresearch/sam3) · [Paper](https://arxiv.org/abs/2511.16719) · [Hugging Face](https://huggingface.co/facebook/sam3)

```bibtex
@misc{carion2025sam3segmentconcepts,
  title={SAM 3: Segment Anything with Concepts},
  author={Nicolas Carion and Laura Gustafson and Yuan-Ting Hu and Shoubhik Debnath and Ronghang Hu and Didac Suris and Chaitanya Ryali and Kalyan Vasudev Alwala and Haitham Khedr and Andrew Huang and Jie Lei and Tengyu Ma and Baishan Guo and Arpit Kalla and Markus Marks and Joseph Greer and Meng Wang and Peize Sun and Roman Rädle and Triantafyllos Afouras and Effrosyni Mavroudi and Katherine Xu and Tsung-Han Wu and Yu Zhou and Liliane Momeni and Rishi Hazra and Shuangrui Ding and Sagar Vaze and Francois Porcher and Feng Li and Siyuan Li and Aishwarya Kamath and Ho Kei Cheng and Piotr Dollár and Nikhila Ravi and Kate Saenko and Pengchuan Zhang and Christoph Feichtenhofer},
  year={2025},
  eprint={2511.16719},
  archivePrefix={arXiv},
  primaryClass={cs.CV},
  url={https://arxiv.org/abs/2511.16719},
}
```

**XMem** (Ho Kei Cheng and Alexander G. Schwing) is used for tracking masks across video frames.
[GitHub](https://github.com/hkchengrex/XMem) · [Paper](https://arxiv.org/abs/2207.07115)

```bibtex
@inproceedings{cheng2022xmem,
  title={{XMem}: Long-Term Video Object Segmentation with an Atkinson-Shiffrin Memory Model},
  author={Cheng, Ho Kei and Alexander G. Schwing},
  booktitle={ECCV},
  year={2022}
}
```

The app is also built with [FastAPI](https://fastapi.tiangolo.com/), [React](https://react.dev/), [Vite](https://vite.dev/), [PyTorch](https://pytorch.org/), [OpenCV](https://opencv.org/) and [FFmpeg](https://ffmpeg.org/).


## AI Use Acknowledgement

Parts of this codebase and its documentation were written with the help of AI coding assistants in the [Cursor](https://cursor.com) editor. All AI-generated code was reviewed, tested and adapted by the author, who takes full responsibility for the final implementation. This is separate from the models the tool itself uses: within the app, masks are proposed by SAM 3 and XMem and then checked and corrected by human annotators, and behaviour labels are assigned by human annotators.


## Copyright
Copyright © 2026 Natural Resources Institute Finland (Luke)

JISTBA was developed by Michal Gregor ([@Eruveoo](https://github.com/Eruveoo)) at Natural Resources Institute Finland (Luke). Luke holds the copyright in the original code. The software is released under the Apache License, Version 2.0; see the LICENSE file for the full terms.

Contributions from the original author and other contributors are welcome.

By submitting a contribution for inclusion in this project, you assign to Luke all transferable copyright in your contribution, including the rights to modify, license and redistribute it. You agree that your contribution will be released under the Apache License, Version 2.0, and confirm that you own the rights being transferred or are authorised by the copyright holder to transfer them.


## License

This project is licensed under the [Apache License 2.0](LICENSE).

The models this tool builds on are not part of this repository; they are installed separately and remain under their own licenses:

- SAM 3 code and model checkpoints: [SAM License](https://github.com/facebookresearch/sam3/blob/main/LICENSE)
- XMem: [MIT License](https://github.com/hkchengrex/XMem/blob/main/LICENSE)

Make sure your use of these models complies with their licenses.
