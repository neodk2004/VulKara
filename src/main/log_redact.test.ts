// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
import { describe, expect, it } from 'vitest'
import { hiddenSummary, redact, type RedactContext } from './log_redact'

const ctx: RedactContext = { home: '/Users/jane', user: 'jane', host: 'Janes-MacBook-Pro.local', volumes: ['4TB_Archive', 'My Passport'] }
const r = (text: string, c: RedactContext = ctx): string => redact(text, c).text

describe('redact: paths', () => {
  it('turns the home folder into ~ and keeps app folders and runtime files', () => {
    expect(r('[diffusers]   File "/Users/jane/Library/Application Support/VulKara/runtimes/diffusers/venv/lib/python3.11/site-packages/torch/nn/modules/module.py", line 1783, in _wrapped_call_impl'))
      .toBe('[diffusers]   File "~/Library/Application Support/VulKara/runtimes/diffusers/venv/lib/python3.11/site-packages/torch/nn/modules/module.py", line 1783, in _wrapped_call_impl')
    expect(r('[diffusers] streaming 32 blocks of transformer from /Users/jane/VulKara/stream_cache/Qwen-Image-2.1'))
      .toBe('[diffusers] streaming 32 blocks of transformer from ~/VulKara/stream_cache/Qwen-Image-2.1')
  })

  it('hides volume names and the folders before an app folder, keeps model names', () => {
    const line = '[diffusers] streaming 32 blocks of transformer from /Volumes/4TB_Archive/IMG-Work/Pixel/models/FLUX.2-klein-9B/stream_cache'
    expect(r(line)).toBe('[diffusers] streaming 32 blocks of transformer from /Volumes/****/****/****/models/FLUX.2-klein-9B/stream_cache')
    expect(r("[import] OSError: Not enough disk space for FLUX.1 [dev]: needs about 15.5 GB, 2.1 GB free on the models disk (/Volumes/4TB_Archive/IMG-Work/Pixel/models). Free some space"))
      .toBe('[import] OSError: Not enough disk space for FLUX.1 [dev]: needs about 15.5 GB, 2.1 GB free on the models disk (/Volumes/****/****/****/models). Free some space')
    expect(r("[import] FileNotFoundError: [Errno 2] No such file or directory: '/Volumes/4TB_Archive/ComfyUI-models/vae/model_index.json'"))
      .toBe("[import] FileNotFoundError: [Errno 2] No such file or directory: '/Volumes/****/****/vae/model_index.json'")
    // a sentence ending with a path keeps its full stop outside
    expect(r('found in directory /Volumes/4TB_Archive/Work/models/FLUX.2-klein-4B/weights.'))
      .toBe('found in directory /Volumes/****/****/models/FLUX.2-klein-4B/weights.')
  })

  it('handles volume names with spaces and other users', () => {
    expect(r('loading /Volumes/My Passport/Secret Project/loras/anime.safetensors')).toBe('loading /Volumes/****/****/loras/anime.safetensors')
    expect(r('copied from /Users/bob/Projects/models/x')).toBe('copied from /Users/****/****/models/x')
    expect(r('/Users/Shared/VulKara/models/x')).toBe('/Users/Shared/VulKara/models/x')
    expect(r('from /Users/jane/My Art Stuff/models/x.safetensors')).toBe('from ~/****/models/x.safetensors')
  })

  it('masks a development checkout and temporary folders up to the engines', () => {
    expect(r('  File "/Users/jane/dev/my-checkout/.worktrees/feature/vulkara/engines/diffusers/importer.py", line 711, in run_import'))
      .toBe('  File "~/****/****/****/****/vulkara/engines/diffusers/importer.py", line 711, in run_import')
    expect(r('  File "/private/tmp/john-doe-42/-Users-jane-dev/b2a8ecfc/scratch/engines/diffusers/engine.py", line 1035, in generate'))
      .toBe('  File "/private/tmp/****/****/****/****/engines/diffusers/engine.py", line 1035, in generate')
    expect(r('/private/var/folders/x7/abc123/T/tmp9/mask.png')).toBe('/private/var/folders/****/****/****/****/****.png')
  })

  it('keeps system paths and JSON paths of the recheck lines', () => {
    expect(r('/Applications/VulKara.app/Contents/Resources/engines/diffusers/main.py')).toBe('/Applications/VulKara.app/Contents/Resources/engines/diffusers/main.py')
    expect(r('/opt/homebrew/bin/python3.11 -I')).toBe('/opt/homebrew/bin/python3.11 -I')
    expect(r('installed LoRAs / models checked again: {"type": "lora", "folder": "/Volumes/4TB_Archive/IMG-Work/Pixel/loras/flux2kl_base_v7", "name": "flux2kl_base_v7", "changes": {"variant": [null, "klein9b"]}}'))
      .toBe('installed LoRAs / models checked again: {"type": "lora", "folder": "/Volumes/****/****/****/loras/flux2kl_base_v7", "name": "flux2kl_base_v7", "changes": {"variant": [null, "klein9b"]}}')
  })

  it('leaves what only looks like a path alone', () => {
    for (const line of [
      '[mlx] 100%|██████████| 4/4 [02:39<00:00, 37.62s/it]',
      '[runtime comfyui] Downloaded torch  [121.4 MiB · 6.5 MiB/s]',
      '[diffusers] [restore] Guard rails kept: 0.0 % change outside the painted damage (allowed 6 %).',
      '[comfyui] ComfyUI ready on port 64448',
      'POST /prompt 200',
      '[diffusers] ~~~~~~~~~~~~~~~~~~~~~^~~~~~~~~~',
      'needs about ~3 GB',
    ]) expect(r(line)).toBe(line)
  })
})

describe('redact: files', () => {
  it('hides the names of pictures and videos, in paths and on their own', () => {
    expect(r('[content_check] could not label /Users/jane/VulKara/images/Holiday Tom 2024.png: bad')).toBe('[content_check] could not label ~/VulKara/images/****.png: bad')
    expect(r('saved IMG_4711.HEIC and clip-final.mov')).toBe('saved ****.HEIC and ****.mov')
    expect(r('/Users/jane/Pictures/family/beach.jpg')).toBe('~/Pictures/****/****.jpg')
    expect(r('/Users/jane/Downloads/photo.jpeg')).toBe('~/Downloads/****.jpeg')
  })

  it('hides the whole of a folder or file name with spaces, commas, brackets or an apostrophe in it', () => {
    expect(r('/Users/jane/Pictures/Urlaub Kreta mit Anna und Ben/IMG_1234.HEIC')).toBe('~/Pictures/****/****.HEIC')
    expect(r("/Users/jane/Pictures/Oma's Geburtstag/x.png")).toBe('~/Pictures/****/****.png')
    expect(r('/Users/jane/Pictures/Anna, Ben (2023)/x.png')).toBe('~/Pictures/****/****.png')
    expect(r('/Users/jane/Pictures/Anna am Strand mit Ben.jpg')).toBe('~/Pictures/****.jpg')
    expect(r('/Users/jane/Pictures/Kunde Müller GmbH Projekt 2024 final/a.png')).toBe('~/Pictures/****/****.png')
    expect(r('[restore] could not open /Users/jane/Documents/Kunde Müller.pdf')).toBe('[restore] could not open ~/Documents/****')
    // a picture's name ends at its extension, the message after it stays; so does a quoted path's end
    expect(r('[restore] /Users/jane/Pictures/beach.jpg: cannot identify image file')).toBe('[restore] ~/Pictures/****.jpg: cannot identify image file')
    expect(r("FileNotFoundError: '/Users/jane/Documents/report', 'size': 3")).toBe("FileNotFoundError: '~/Documents/****', 'size': 3")
  })

  it('keeps technical file names', () => {
    expect(r('[mlx] Applying LoRA: z_image_baec52651432dc58.safetensors (scale=1.0)')).toBe('[mlx] Applying LoRA: z_image_baec52651432dc58.safetensors (scale=1.0)')
    expect(r('No such file: model_index.json')).toBe('No such file: model_index.json')
  })
})

describe('redact: names of the Mac and its user', () => {
  it('hides the user name, host name and volume names wherever they are left', () => {
    expect(r('folder -Users-jane-dev of jane on Janes-MacBook-Pro.local')).toBe('folder -Users-****-dev of **** on ****')
    expect(r('Bonjour name Janes-MacBook-Pro')).toBe('Bonjour name ****')
    expect(r('disk 4TB_Archive is full')).toBe('disk **** is full')
    expect(r('janet and jane.doe')).toBe('janet and ****.doe')
  })

  it('hides a folder name of a path also where it appears on its own', () => {
    const out = r('[import] from /Volumes/4TB_Archive/IMG-Work/models/x\nthe folder IMG-Work is full')
    expect(out).toBe('[import] from /Volumes/****/****/models/x\nthe folder **** is full')
  })
})

describe('redact: contact and machine data', () => {
  it('hides e-mail, IP, MAC addresses and UUIDs, not localhost', () => {
    expect(r('mail jane.doe+vk@example.co.uk now')).toBe('mail **** now')
    expect(r('connect 192.168.1.23:8188 and 127.0.0.1:8188 and 0.0.0.0')).toBe('connect ****:8188 and 127.0.0.1:8188 and 0.0.0.0')
    expect(r('v6 fe80::1c2b:3aff:fe4d:5e6f%en0 and ::1 and 2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe('v6 ****%en0 and ::1 and ****')
    expect(r('en0 a4:83:e7:12:34:56')).toBe('en0 ****')
    expect(r('(Request ID: Root=1-6ac66560-3252a82e4c1fb3e25f706570;73f9bba4-6057-4ffd-bd42-817cdd32a86c)'))
      .toBe('(Request ID: Root=1-6ac66560-3252a82e4c1fb3e25f706570;****)')
  })

  it('leaves times, versions and sizes alone', () => {
    for (const line of [
      '2026-10-07 10:33:55  [mlx] starting',
      '[mlx] 100%|██████████| 4/4 [02:51<00:00, 40.85s/it]',
      'torch==2.5.1.0 installed',
      'cv::dnn and x[::2]',
      '999.1.2.3 is no address',
    ]) expect(r(line)).toBe(line)
  })
})

describe('redact: tokens and secrets', () => {
  it('hides access tokens and keys', () => {
    expect(r('HF_TOKEN=hf_AbCdEfGhIjKlMnOpQrStUvWxYz012345')).toBe('HF_TOKEN=****')
    expect(r('ghp_0123456789abcdefABCDEF0123456789abcd and github_pat_11ABCDEFG0123456789_abcdefghijklmnopqrstuvwxyz'))
      .toBe('**** and ****')
    expect(r('Authorization: Bearer abc.def-123')).toBe('Authorization: ****')
    expect(r('headers {"Authorization": "Bearer xyz123456"}')).toBe('headers {"Authorization": "****"}')
    expect(r('sent with Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U')).toBe('sent with Bearer ****')
    expect(r('civitai key 0123456789abcdef0123456789abcdef in use')).toBe('civitai key **** in use')
    expect(r('apikey=Z9x8C7v6B5n4M3a2 set')).toBe('apikey=**** set')
    expect(r('secret Ab3dEf7hIj1lMn5pQr9tUv2xYz4bCd6fGh8jKl0n end')).toBe('secret **** end')
    expect(r('{"token": "abc", "civitai_token": "x1"}')).toBe('{"token": "****", "civitai_token": "****"}')
  })

  it('keeps checksums, commits and code', () => {
    const sha256 = 'sha256 0f343b0931126a20f133d67c2b018a3b2f2f2b5f2e8f9d3c4b5a6978e1d2c3b4'
    expect(r(sha256)).toBe(sha256)
    const commit = 'tree/f332072aa78be7aecdf3ee76d5c247082da564a6'
    expect(r(commit)).toBe(commit)
    expect(r('    info = inspect(source, ref, file=file, token=token, name_hint=base_hint)')).toBe('    info = inspect(source, ref, file=file, token=token, name_hint=base_hint)')
    expect(r('step caching: not available for QwenImage21Transformer2DModelWithConditioningEmbeds')).toBe('step caching: not available for QwenImage21Transformer2DModelWithConditioningEmbeds')
  })
})

describe('redact: links', () => {
  it('keeps host and path of a link, hides its query and fragment', () => {
    expect(r("[import] Error while downloading from https://huggingface.co/api/resolve-cache/models/Tongyi-MAI/Z-Image-Turbo/f332072aa78be7aecdf3ee76d5c247082da564a6/tokenizer%2Fmerges.txt?%2FTongyi-MAI&etag=%2231349551%22: The read operation timed out"))
      .toBe('[import] Error while downloading from https://huggingface.co/api/resolve-cache/models/Tongyi-MAI/Z-Image-Turbo/f332072aa78be7aecdf3ee76d5c247082da564a6/tokenizer%2Fmerges.txt?****: The read operation timed out')
    expect(r('download https://civitai.com/api/download/models/12345?type=Model&token=0123456789abcdef0123456789abcdef.'))
      .toBe('download https://civitai.com/api/download/models/12345?****.')
    expect(r("httpx.HTTPStatusError: Client error '404 Not Found' for url 'https://huggingface.co/abenzer/Qwen-GGUF/resolve/main/model_index.json'"))
      .toBe("httpx.HTTPStatusError: Client error '404 Not Found' for url 'https://huggingface.co/abenzer/Qwen-GGUF/resolve/main/model_index.json'")
    expect(r('https://jane:secret@example.com/x#part')).toBe('https://****@example.com/x#****')
    expect(r('file:///Users/jane/Art/a.png')).toBe('file://~/****/****.png')
  })
})

describe('redact: prompts and user texts', () => {
  it('hides string values of text keys in JSON and Python dicts', () => {
    expect(r('{"prompt": "a red fox in the snow", "negative_prompt": "blurry, \\"bad\\"", "steps": 20, "seed": 42}'))
      .toBe('{"prompt": "****", "negative_prompt": "****", "steps": 20, "seed": 42}')
    expect(r("job {'prompt': 'Tom at the lake', 'width': 1024}")).toBe("job {'prompt': '****', 'width': 1024}")
    expect(r('"defaults": [{"num_steps": 30, "negative_prompt": "low quality, ugly"}], "negative_prompt": [false, true]'))
      .toBe('"defaults": [{"num_steps": 30, "negative_prompt": "****"}], "negative_prompt": [false, true]')
    expect(r('{"trigger_words": ["br33zy", "fox girl"], "title": "My LoRA", "display_name": "Jane\'s model", "note": "for mum", "description": [null, "about"]}'))
      .toBe('{"trigger_words": ["****", "****"], "title": "****", "display_name": "****", "note": "****", "description": [null, "****"]}')
    expect(r('{"class_type": "CLIPTextEncode", "inputs": {"text": "a castle", "clip": ["4", 1]}}'))
      .toBe('{"class_type": "CLIPTextEncode", "inputs": {"text": "****", "clip": ["4", 1]}}')
  })

  it('hides keyword arguments and labelled prompts, not code', () => {
    expect(r("pipe(prompt='a cat on a sofa', num_inference_steps=4)")).toBe("pipe(prompt='****', num_inference_steps=4)")
    expect(r('Prompt: a portrait of my neighbour')).toBe('Prompt: ****')
    expect(r('[train] caption: jane at the beach')).toBe('[train] caption: ****')
    expect(r('negative prompt: ugly')).toBe('negative prompt: ****')
    for (const line of [
      '[mlx] loaded RedCraft_3.0_Krea2, quantize=4, text encoder only for new prompts',
      '    def encode(self, prompt: str, steps: int):',
      '        out = pipe(prompt=prompt, generator=generator)',
      'got prompt',
    ]) expect(r(line)).toBe(line)
  })
})

describe('redact: counts', () => {
  it('counts per category and sums them up', () => {
    const { counts } = redact([
      '  File "/Users/jane/dev/x/engines/a.py", line 1',
      '  File "/Users/jane/dev/x/engines/b.py", line 2',
      'HF_TOKEN=hf_AbCdEfGhIjKlMnOpQrStUvWxYz012345',
      '{"prompt": "a fox"}',
    ].join('\n'), ctx)
    expect(counts.paths).toBe(2)
    expect(counts.tokens).toBe(1)
    expect(counts.prompts).toBe(1)
    expect(hiddenSummary(counts)).toBe('Hidden: 2 paths, 1 prompt or text, 1 token')
    expect(hiddenSummary(redact('nothing here', ctx).counts)).toBe('Nothing personal found')
  })

  it('works without a context', () => {
    expect(redact('/Users/someone/stuff/models/x').text).toBe('/Users/****/****/models/x')
  })
})
