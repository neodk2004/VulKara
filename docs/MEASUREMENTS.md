# Measurements

Every benchmark and measurement made while developing VulKara, with its setup, so that a question that was answered
once is not measured again. New measurements go here too (date, machine, what was measured, the numbers, what was
concluded). The developer guide points here from its guardrails.

**Machines.** *M2*: MacBook Pro (13-inch, M2, 2022), 24 GB unified memory, 10 GPU cores, macOS 27, internal SSD plus
a 2 TB Crucial USB SSD (exFAT) holding the models and the streaming caches. *M4*: Mac mini (2024), Apple M4, 16 GB
(the user's second Mac; results there are the user's live reports). A *16 GB simulation* on the M2 means
Settings → *Memory kept free for other apps* = 12 GB (`VK_MEMORY_RESERVE_GB=12`), which gives the 12 GB budget of a
16 GB Mac.

## 1. SSD read speed (2026-10-09, M2)

Reading 24 whole stream-cache blocks of FLUX.1 [dev] (`scratchpad io_bench.py`: `os.readv` of whole files; `F_NOCACHE`
bypasses the macOS file cache).

| Disk | Data | 1 read at a time | 2 at a time | 3 at a time | 64 MB chunks | plain read (cached) |
| --- | --- | --- | --- | --- | --- | --- |
| 2 TB Crucial, USB | 6.8 GB | 0.92 GB/s | 0.92 GB/s | 0.93 GB/s | 0.90 GB/s | 0.94 GB/s |
| internal SSD | 9.9 GB | 2.73 GB/s | 3.30 GB/s | 3.32 GB/s | 2.70 GB/s | 3.13 GB/s |

Conclusions: the USB SSD is saturated by one read; the internal one gains about 20 % from two reads at once and
nothing more from three. `F_NOCACHE` and chunking change nothing. Streaming therefore reads two blocks ahead with two
readers (`streaming.PREFETCH`, `READERS`). A streaming cache on the internal SSD reads three times faster than on the
USB disk.

## 2. SSD streaming profiles (2026-10-09, M2, cache on the USB SSD)

`VK_STREAM_PROFILE=1` per picture: passes of the denoiser (two per step with true guidance), blocks read, GB read, time
waiting for the SSD / copying to the GPU / computing. "Before" is the original streaming (every block read every
step, 15 % resident share); "after" keeps the blocks the memory plan has room for (`engine.keep_plan`).

| Case | Picture | Blocks kept | Read | Waiting | Copying | Computing | Waiting share | Picture time |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| FLUX.1 [dev], 16 GB sim, before | 3 steps, 512² | 0 | 66.8 GB | 50.7 s | 2.7 s | 26.6 s | 63 % | 81.0 s |
| FLUX.1 [dev], 16 GB sim, after | 3 steps, 512² | 8 (2.8 GB), released per prompt | 61.7 GB | 38.1 s | 8.5 s | 22.6 s | 55 % | 70.7 s |
| FLUX.1 [dev], 24 GB, after | 3 steps, 512² | per plan (30 %) | | | | | | 57.2 s |
| FLUX.1 [dev], 16 GB sim, after | 2 steps, 1024² | 8 (2.8 GB) | 42.5 GB | 4.1 s | 11.9 s | 50.5 s | 6 % | 72.0 s (GPU peak 5.3 GB) |
| Chroma1-Flash, guidance 4, 16 GB sim, after | 2 steps, 1024² | 5 (1.3 GB) | 59.9 GB | 1.0 s | 15.6 s | 108.6 s | 1 % | 130.1 s (GPU peak 4.2 GB) |

What the memory plan keeps of FLUX.1 [dev] (`keep_plan`): 16 GB → 10 % (released while a new prompt is encoded),
24 GB → 30 %, 32 GB → 60 %.

Conclusions: at 512 px streaming is bound by reading (55–63 % waiting), at 1024 px by computing (1–6 % waiting), so
at the usual size the reading is already hidden behind the GPU. Batching the guided and the unguided pass of true
guidance would save only reading and nothing at 1024 px; it was not built. The kept blocks gave −13 % at 512 px on
16 GB. Further speed at 1024 px can only come from fewer steps (step caching, turbo LoRAs).

### A GGUF model streamed (2026-10-11, M2 24 GB, 16 GB sim, cache on the internal SSD)

xeHentaiAnimeFLUX_04, a FLUX.1 [dev] fine-tune imported from an FP8 file and stored as 8 bit GGUF (12.6 GB), which
before was refused on 16 GB ("needs about 23 GB"). `streaming.unpack_gguf` unpacks it into the stream cache once.

| Run | Picture | Unpacking | Picture time | Total | Notes |
| --- | --- | --- | --- | --- | --- |
| first | 12 steps, 768², guidance 3.5 | ≈ 2½ min (57 blocks, 22 GB written; the process stayed near 2 GB RAM) | 250.4 s | 427.5 s | 49 blocks streamed, 8 (2.8 GB) kept; 0 % waiting; GPU peak 5.3 GB |
| second | 4 steps, 512² | none (only rest.safetensors read) | 51.7 s | 80.5 s | the GGUF file is not read again |

The reads (234.5 GB in the first run) came from the page cache of the 24 GB Mac; a real 16 GB Mac reads them from the
SSD, as in the table above.

## 3. Step caching (2026-10-10, M2, 24 GB)

FLUX.1 [dev], 28 steps, 768², same seed, diffusers' First Block Cache (`step_cache.py`). The *off* run was slowed by
a leftover engine process that pushed the Mac into swap, so its time is not comparable; the expected speed-ups
follow from the runs reused.

| Level | Threshold | Runs reused | Picture time | PSNR against off | Expected speed-up (from the reuse) |
| --- | --- | --- | --- | --- | --- |
| off | – | 0 of 28 | 753 s (swap-affected) | – | 1× |
| light | 0.05 | 5 of 28 | 547 s | 41.0 dB | about 1.2× |
| strong | 0.12 | 15 of 28 | 294 s | 31.3 dB | about 2× |

Conclusions: light is practically identical to off (41 dB), strong keeps the picture and loses fine detail.

2026-10-11 (M2, Diffusers runtime forced): Z-Image Turbo, Qwen-Image 2.1 (Q4 GGUF) and FLUX.2 [klein] 4B are not
cached at all: the engine logs "step caching: not available for ZImageTransformer2DModel / QwenImage21Transformer2DModel
/ Flux2Transformer2DModel", because diffusers' block registry (0.41) does not know their blocks. Their pictures with
off, light and strong took the same time (Z-Image 165–168 s, Qwen-Image 248–256 s at 768², 8 steps). So the
thresholds stay those of FLUX.1, the only family the cache works for here; the setting's texts say so.

## 4. Photo tools (2026-10-10, M2, CPU via onnxruntime)

A 768 × 768 picture, the recommended tools of `photo_tools.json`, run from a script and again as jobs in the app.

| Tool | Model | Download | Script | In the app |
| --- | --- | --- | --- | --- |
| Sharpen | NAFNet (opencv export, quantized) | 92 MB, 7 s | 14.1 s | 14.8 s |
| Denoise | SCUNet | 77 MB, 8 s | 20.0 s | |
| Upscale ×4 | SwinIR-M (rocca export, dynamic) | 61 MB, 13 s | 162 s (→ 3072²) | |
| Remove background | BiRefNet lite fp16 | 115 MB, 2 s | 7.6 s | 8.2 s |
| Select objects | SAM 2.1 hiera tiny | 155 MB, 5 s | first click 1.6 s, next 0.03 s | 2.0 s, next 0.07 s |

### CPU against CoreML (onnxruntime's CoreML execution provider, MLProgram), one tile each

| Tool | Tile | CPU | CoreML, static shapes | CoreML, dynamic shapes |
| --- | --- | --- | --- | --- |
| NAFNet | 512² | 3.36 s | 3.57 s (max diff 0) | 139.6 s (max diff 0.003), 71 s to compile |
| SCUNet | 512² | 4.41 s | 4.61 s (max diff 0) | fails to load (axis out of range) |
| SwinIR ×4 | 64² | 0.56 s | 0.58 s (max diff 0) | fails at run time (zero-element dynamic shape) |

Conclusions: CoreML does not know the operators of these exports; with static shapes everything falls back to the
CPU (identical times and results), with dynamic shapes it is 40× slower or breaks. CoreML through onnxruntime is a
dead end for these three. The way to speed is the GPU through PyTorch: `spandrel` 0.4.2 (MIT) loads the original
weights of NAFNet, SCUNet, SwinIR, HAT, DAT, FBCNN, ESRGAN, SPAN, OmniSR, RealCUGAN, GFPGAN on MPS (Real-ESRGAN of
the Upscale page already runs this way); since 0.4.14 it is in the Diffusers runtime's requirements.

### The original weights on the GPU (2026-10-10, M2 24 GB, spandrel 0.4.2, torch 2.14.1, MPS, fp32)

One tile each, after a warm-up run:

| Model | File | 256² | 512² |
| --- | --- | --- | --- |
| NAFNet-GoPro-width64 | 272 MB .pth (HF mirror, pinned) | 0.26 s | 0.95 s (CPU ONNX 3.36 s) |
| SCUNet colour real PSNR | 72 MB .pth (KAIR release v1.0) | 0.35 s | 1.46 s (CPU ONNX 4.41 s) |
| SwinIR-M ×4 real GAN | 67 MB .pth (SwinIR release v0.0) | 4.17 s (→ 1024²) | 16.3 s (→ 2048²) |
| FBCNN colour | 288 MB .pth (FBCNN release v1.0) | 0.15 s | 0.59 s |

The whole 768² picture through `run_image` (tiles with overlap 32, GPU alone):

| Tool | Tile | Time | Against the first setting |
| --- | --- | --- | --- |
| SCUNet | 512 | 5.9–7.2 s | |
| SCUNet | 768 (one tile) | 3.1–4.1 s | max diff 3, mean 0.03 |
| SCUNet fp16 | 512 / 768 | 5.9 s / 3.0 s | max diff 1–3, mean 0.02–0.05 |
| FBCNN | 512 | 3.0 s | |
| FBCNN | 768 (one tile) | 1.7–1.9 s | max diff 2, mean 0.01 |
| FBCNN fp16 | 512 / 768 | 3.5 s / 1.6 s | max diff 1–2 |
| SwinIR ×4 | 256 | 73 s | |
| SwinIR ×4 | 384 | 77 s | max diff 26, mean 0.18 |
| SwinIR ×4 | 512 | 61–65 s | max diff 22, mean 0.19 |
| SwinIR ×4 | 768 (one tile) | 34–35 s | max diff 23, mean 0.15 |
| SwinIR ×4 | 1024 (one 1024² tile) | 214 s | far slower than 768 |

SwinIR does not support half precision (spandrel: `supports_half` false, the fp16 runs were fp32). fp16 gains
25–30 % for SCUNet and FBCNN at 768 with tiny differences; it is not switched on in the catalog (a manifest can set
`"half": true`), because the risk of overflow on other content is not worth a second.

Peak Metal memory per tile (driver allocation, model included, read just before the cache is emptied):

| Tool | 256² | 384² | 512² | 768² | 1024² | 1536² |
| --- | --- | --- | --- | --- | --- | --- |
| SwinIR ×4 | 2.3 GB | 4.5 GB | 7.1 GB | 16.1 GB | – | – |
| SCUNet | | | 2.3 GB | 3.4 GB | 4.9 GB | 12.1 GB |
| FBCNN | | | 1.4 GB | 2.5 GB | 2.5 GB | 5.4 GB |

Seconds per megapixel of input from these runs: SCUNet 6.1 (512) → 5.3 (768) → 5.0 (1024) → 4.6 (1536); FBCNN
3.5 → 2.9 → 2.4 → 2.2. The catalog's `tile_metal_gb` tables hold the measured tiles up to SCUNet 1024, FBCNN 1024 and
SwinIR 512 (7 GB; 768 would take 16 GB and is left out); `metal_tile` picks the largest that fits in what is left of
Metal's budget (0.74 × RAM) beside the loaded diffusion model, with 1 GB headroom. On a 16 GB Mac (budget 11.8 GB)
with SDXL loaded (7 GB) SwinIR therefore runs at 256, SCUNet at 768; with nothing loaded at 512 and 1024.

**NAFNet's original weights are unusable in tiles.** On the 768² benchmark picture, crops through the raw model
(CPU and MPS alike, fp32 and fp64 alike) give outputs with means far from the input and values in the thousands:

| Weights | 512² crops (128 grid, 9) | 256² crops (25) | Whole picture |
| --- | --- | --- | --- |
| NAFNet-GoPro-width64 | 2 bad | 7 bad | fine |
| NAFNet-REDS-width64 | 1 bad | 5 bad | fine |
| NAFNet-GoPro-width32 | 8 bad | 15 bad | bad (mean 0.41 for 0.35, max 5.9) |
| NAFNet-SIDD-width32 (a denoiser) | 0 bad | 0 bad | fine |

A tiled run shows this as noise over whole tiles. OpenCV's ONNX export (`deblurring_nafnet_2025may`) showed none
of it in the earlier runs, so Sharpen keeps that export on the CPU (14 s for 768²); Denoise, Upscale and the new
JPEG tool run from their original weights on the GPU. Whole 768² picture through `run_image` with the catalog's
tiles on this Mac: Denoise 3–4 s, JPEG artefacts 1.7 s, Upscale ×4 (tile 512) 61–65 s; the first run of a process
adds 1–5 s for loading. As jobs in the app (engine log): Denoise 5.4 s (first run, model loading included), JPEG
artefacts 1.7 s.

### Upscale page: Real-ESRGAN x4plus through ComfyUI (2026-10-10, M2 24 GB, test instance)

Pictures over 2048 px are made smaller to 2048 first; the model enlarges 4 times, the result is scaled to the exact
size asked for (ComfyUI `ImageScale`, Lanczos).

| Picture | Factor | Model gets | Result | Time (job, ComfyUI start included) |
| --- | --- | --- | --- | --- |
| 3072 × 2048 | × 2 | 2048 × 1365 | 6144 × 4096 | 74 s (twice) |
| 1567 × 2417 (the user's photo) | × 2 | 1328 × 2048 | 3135 × 4834 (before the exact size: one pixel too wide) | – |

### Fine-tuning: FBCNN's JPEG quality and SCUNet's sharp weights (2026-10-10, M2 24 GB)

The 768² example saved as JPEG quality 15 (mean difference to the clean picture 5.72 of 255); each result against the
clean picture.

| Setting | Time | Mean difference |
| --- | --- | --- |
| JPEG cleanup, Auto (estimated) | 6.1 s (first, loading) | 4.09 |
| JPEG cleanup, quality 10 | 2.7 s | 4.31 |
| JPEG cleanup, quality 30 | 2.7 s | 4.33 |
| JPEG cleanup, quality 50 | 2.7 s | 4.75 |
| JPEG cleanup, quality 90 | 2.7 s | 5.57 |
| Denoise, Natural (real_psnr) | 6.4 s | 4.30 |
| Denoise, Sharp (real_gan) | 7.8 s | 5.06 |

FBCNN's quality embedding takes 1 − quality/100 (as in its own test code); the first try passed quality/100 and the
direction was reversed (10 left the blocks, 90 smoothed most). Sharp is further from the clean picture by design: it
adds texture. In the app, quality 30 and Sharp together took 17 s, the Sharp download (72 MB) included.

### Baking LoRAs into a model (2026-10-10, M2 24 GB, test instance)

| Base | LoRA | Time | Result |
| --- | --- | --- | --- |
| SD-1.5 (single file) | Tattoo_Maker_SD1 at 0.8 | 12 s (load, bake, save, manifest) | 512², 20 steps, seed 5: baked model vs base + LoRA mean difference 3.46 of 255; base alone vs base + LoRA 65.2 |
| Juggernaut XL v7 (single file), 2026-10-11 | Tattoo_gen at 0.8 | 34 s; 6.9 GB written | the new model in folder layout, its trigger word taken over |
| FLUX.2 [klein] 9B, 2026-10-11 | flux2klein_br33zy_v1 | refused at once | "needs about 24 GB of free memory, 17 GB are free now" (9 B parameters at 2 bytes, × 1.3) |

**Export as one file** (2026-10-11, M2): the baked Juggernaut XL written as one `.safetensors` checkpoint and loaded back
with diffusers' `from_single_file`: the same picture as from the folder (768², 8 steps, seed 7: mean difference
0.00 of 255, PSNR 138 dB). transformers 5 saves the first text encoder without `text_model.` in its keys; the export
puts it back, else `from_single_file` finds no CLIP model.

**ControlNet end to end** (2026-10-11, M2): Juggernaut XL with ControlNet Union ProMax (pose), a skeleton from the Pose
editor, 768 × 1024, 25 steps: 169 s; the dancer takes the drawn pose.

### Restore: faces and soft detail (2026-10-10, M2 24 GB)

The user's photo, a 1950s wedding scan (1567 × 2417, grey, faces about 60 px from the eyes to the mouth), and AI-made
test pictures made old (grey, blurred, three or four times smaller, grain, JPEG) with the original as the truth.

**Faces, GFPGAN v1.4 against CodeFormer** (YuNet landmarks, FFHQ alignment, 512 px):

| | GFPGAN 1.4 | CodeFormer 0.5 | CodeFormer 0.8 | CodeFormer 1.0 |
| --- | --- | --- | --- | --- |
| Test face, PSNR / SSIM to the original (made old: 23.85 / 0.572) | 23.99 / 0.575 | 23.90 / 0.578 | 24.26 / 0.587 | 24.34 / 0.588 |
| Wedding scan | invented glasses on the groom and earrings | eyes changed a little | faces kept | faces kept |
| Sepia picture | tinted the skin pink | tone kept | tone kept | tone kept |
| Time per face | 0.3 s | 0.5 s | 0.5 s | 0.5 s |

Chosen: CodeFormer. Taken from Real-ESRGAN's result, it turned the texture into wrinkles and aged the faces; taken
from the photo before the AI steps and blended at 50–60 % the faces stayed closest to themselves (defaults: faithful
90 %, strength 60 %).

**Whole picture** (test pictures made 3 × smaller; PSNR / SSIM to the original):

| | Made old | SCUNet | SCUNet GAN | SwinIR via ÷3 | SwinIR via ÷2 | Real-ESRGAN via ÷3 |
| --- | --- | --- | --- | --- | --- | --- |
| Hands | 34.98 / 0.931 | 36.41 / 0.965 | 34.10 / 0.963 | 34.74 / 0.952 | 30.80 / 0.931 | 35.03 / 0.955 |
| Street at night | 24.20 / 0.717 | 24.20 / 0.733 | 23.84 / 0.727 | 21.84 / 0.657 | 21.59 / 0.666 | 22.28 / 0.623 |

SCUNet wins the numbers but only smooths (the soft mush stays); SwinIR is the crispest but invents patterns (grids in
walls); Real-ESRGAN rebuilt clear edges with the least made up and is the fastest. Chosen: Real-ESRGAN x4plus. On the
wedding scan, ÷ 3 turned a stain into an object; ÷ 2 is the default. Texture that is lost entirely (fabric, leaves)
stays soft: only the FLUX.2 repair makes it up.

**Real-ESRGAN x4plus, tiles on the GPU** (input 784 × 1208, output 4×):

| | Tile 256 | Tile 384 | Tile 512 |
| --- | --- | --- | --- |
| float32: time, Metal peak | 27.3 s, 1.08 GB | 30.0 s, 2.32 GB | 26.0 s, 4.34 GB |
| float16: time, Metal peak | 21.4 s, 1.11 GB | 22.5 s, 2.15 GB | 19.7 s, 2.18 GB |

float16 differs from float32 by 0.08 of 255 on average; the tile size by 0.17. Restore uses float16 with the tile the
room in Metal allows (`tile_metal_gb` 1.3 / 2.4 / 3.0 GB with headroom). In the app the whole wedding scan (correct,
details ÷ 2, two faces) took 24 s, a 768 px preview 18 s.

**Dust and scratches**: the ratio of a candidate's response (black-hat / top-hat) to the average response of its
surroundings (Gaussian, σ = 2 kernels): on the AI-made old photo (drawn dust and scratches) the 75th/90th/97th
percentiles were 7.7 / 12.1 / 14.1, on the wedding scan's leaves and blossoms 3.8 / 5.0 / 8.0. A threshold of 9 − 5 ×
sensitivity (6.5 at the default 0.5) kept the drawn dust and all nine scratches and 0.17 % of the scan (the speck on
a cheek, part of a brooch) instead of 3.8 % (the leaves) with the response threshold alone.

**AI repair on a 16 GB Mac** (16 GB simulation: 12 GB kept free; FLUX.2 [klein] 4B, 4 steps, the AI-made old photo
768 × 1024 with dust removal, details and faces): the model was loaded compressed as on a 16 GB Mac, the picture took
213 s, the whole restoration 305 s, without running out of memory. The repair works at the model's pixel count (about
1 MP in the photo's proportions) whatever the photo's size, so large scans need no more.

**Correction**: the wedding scan before had 0.54 % of its pixels clipped to white (the dress), with the soft shoulder
0.00 %; the folds stayed.

**Colour profiles**: a JPEG with the profile *Rec. 2020 PQ* has paper white at code 144 of 255; read without the
profile its brightest 1 % reached 144, through LittleCMS 181, decoded by hand (203 cd/m² = white) 238.

## 5. Metal's memory budget (2026-10-10)

`torch.mps.recommended_max_memory()` on the M2 (24 GiB): 17.76 GiB = 74 %. LM Studio shows 11.84 GB on a 16 GB M4 =
74 %. The Hardware page puts the GPU budget at 74 % of the unified memory (`system_stats.metalBudgetGb`).

## 6. Mac mini M4, 16 GB (the user's live reports, 2026-10-09, release 0.4.2 and later)

| Case | Before | Now |
| --- | --- | --- |
| FLUX.1 [dev] | MLX refused ("needs about 26 GB RAM"), no picture | hands over to Diffusers, streams from the SSD, picture made |
| Krea 2 | refused | runs |
| Qwen-Image 2.1 repository | MemoryError (23 GB) | runs (text encoder in 4 bit, cached) |
| Fluxtrait single-file import | "too large" | imports |

### A GGUF model streamed on the M4 (2026-10-12, release 0.4.16, the user's log)

FLUX.1 [schnell] 8 bit GGUF (refused by 0.4.15: "needs about 23 GB"), stream cache next to the model on an external
USB disk; 1280 × 832, 18 steps (the model is made for 4), guidance 6.2 (without effect on [schnell]).

| Step | Time |
| --- | --- |
| GGUF file unpacked into the stream cache (once) | 2 min 17 s |
| T5 text encoder quantized and cached (once) | 27.3 s |
| First picture: 49 blocks streamed, 8 (2.8 GB) kept, released per prompt | 786.5 s (≈ 44 s per step) |

Per megapixel and step that is close to the M2 in the 16 GB simulation (FLUX.1 [dev], 768², ≈ 21 s per step, cache
in the page cache): the M4 is not slower, the extra comes from the size and the USB disk. With 4 steps the same
picture takes about 3 minutes. The first picture after unpacking also pays for the memory macOS still had to free.

Not yet checked on the M4 (only in the 16 GB simulation on the M2): step caching, the photo tools, the stream cache on
the internal SSD.

## 7. Interface measurements (2026-10-10, M2)

- Navigation: the rail switches to two columns below a window height of 1054 px and back above 1074 px, once in
  each direction; no jitter (2 px steps, every change of the rail width logged).
- Models → Installed, cards fixed at 230 px: 1100 px window → 3 columns, 1360 → 4, 1600 → 5, 1919 → 7, 3405 → 10
  (the maximum).
- Status bar and Hardware page: measuring every 2 s (`ps`, `vm_stat`, `os.cpus`) is not visible in the CPU figure;
  the streaming caches are measured every 30 s. On the M2 the caches took 61 GB with 13 GB left on the USB SSD.

## 8. Earlier references (from the user guide and the changelog)

- Training on the M2 (2025–26): SDXL about 2.5 s per step at 768 px, FLUX.2 [klein] 4B about 15 s, 9B about 30 s,
  Krea 2 about 45 s per step.
- Chroma1-Flash on the M2 with 24 GB: about 7 minutes per picture at 1024 px with its 12 steps and no guidance, about
  52 with guidance (two passes per step); float16 instead of bfloat16 on M1/M2 is about 40 % faster.
- ComfyUI runtime install into an empty folder (2026-10-10): uv 0.12.23 pinned, ComfyUI 0.38.0 and ComfyUI-GGUF
  checked by content hash, 85 packages, a few minutes on a 5 MB/s download.
