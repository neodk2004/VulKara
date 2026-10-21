// SPDX-License-Identifier: LicenseRef-PolyForm-Noncommercial-1.0.0
// Copyright (C) 2026 Oliver Schmidt
// Styles: a style puts the prompt into a template and adds what the picture should not show. Models without
// a negative prompt (FLUX) use the template only. The job keeps the prompt as written and the name of the style.

import type { PlainKey } from './i18n'

export interface Style {
  name: string
  group: 'photo' | 'illustration' | 'stylized' | 'craft'
  hint: PlainKey
  /** {prompt} is replaced by the prompt */
  template: string
  negative: string
}

export const STYLE_GROUPS: { id: Style['group']; title: PlainKey }[] = [
  { id: 'photo', title: 'generate.styles.groups.photo' },
  { id: 'illustration', title: 'generate.styles.groups.illustration' },
  { id: 'stylized', title: 'generate.styles.groups.stylized' },
  { id: 'craft', title: 'generate.styles.groups.craft' },
]

export const STYLES: Style[] = [
  { name: 'Enhance', group: 'photo', hint: 'generate.styles.hints.enhance',
    template: 'breathtaking {prompt}, award-winning, professional, highly detailed',
    negative: 'ugly, deformed, noisy, blurry, distorted, grainy' },
  { name: 'Photographic', group: 'photo', hint: 'generate.styles.hints.photographic',
    template: 'cinematic photo {prompt}, 35mm photograph, film, bokeh, professional, 4k, highly detailed',
    negative: 'drawing, painting, crayon, sketch, graphite, impressionist, noisy, blurry, soft, deformed, ugly' },
  { name: 'Cinematic', group: 'photo', hint: 'generate.styles.hints.cinematic',
    template: 'cinematic film still {prompt}, shallow depth of field, vignette, highly detailed, high budget, bokeh, cinemascope, moody, epic, gorgeous, film grain',
    negative: 'anime, cartoon, graphic, text, painting, crayon, graphite, abstract, glitch, deformed, mutated, ugly, disfigured' },
  { name: 'Analog Film', group: 'photo', hint: 'generate.styles.hints.analog_film',
    template: 'analog film photo {prompt}, faded film, desaturated, 35mm photo, grainy, vignette, vintage, Kodachrome, Lomography, stained, highly detailed, found footage',
    negative: 'painting, drawing, illustration, glitch, deformed, mutated, cross-eyed, ugly, disfigured' },
  { name: 'Black & White', group: 'photo', hint: 'generate.styles.hints.black_white',
    template: 'black and white photograph of {prompt}, grayscale, monochrome, no color, high contrast, deep blacks, fine film grain, dramatic light and shadow, timeless',
    negative: 'color, colorful, color photo, orange, red, green, blue, saturated, sepia, tinted, low contrast, blurry, deformed, ugly' },
  { name: 'Romantic', group: 'photo', hint: 'generate.styles.hints.romantic',
    template: 'romantic scene of {prompt}, warm golden hour light, soft glow, rose and warm red tones, dreamy bokeh, tender atmosphere, soft focus, sunset colors, highly detailed',
    negative: 'cold colors, harsh light, gloomy, gritty, desaturated, blurry, deformed, ugly' },
  { name: 'Anime', group: 'illustration', hint: 'generate.styles.hints.anime',
    template: 'anime artwork {prompt}, anime style, key visual, vibrant, studio anime, highly detailed',
    negative: 'photo, deformed, black and white, realism, disfigured, low contrast' },
  { name: 'Digital Art', group: 'illustration', hint: 'generate.styles.hints.digital_art',
    template: 'concept art {prompt}, digital artwork, illustrative, painterly, matte painting, highly detailed',
    negative: 'photo, photorealistic, realism, ugly' },
  { name: 'Comic Book', group: 'illustration', hint: 'generate.styles.hints.comic_book',
    template: 'comic {prompt}, graphic illustration, comic art, graphic novel art, vibrant, highly detailed',
    negative: 'photograph, deformed, glitch, noisy, realistic, stock photo' },
  { name: 'Fantasy Art', group: 'illustration', hint: 'generate.styles.hints.fantasy_art',
    template: 'ethereal fantasy concept art of {prompt}, magnificent, celestial, ethereal, painterly, epic, majestic, magical, fantasy art, cover art, dreamy',
    negative: 'photographic, realistic, realism, 35mm film, dslr, cropped, frame, text, deformed, glitch, noisy, bad anatomy, ugly, disfigured, black and white' },
  { name: 'Science Fiction', group: 'illustration', hint: 'generate.styles.hints.science_fiction',
    template: 'science fiction art of {prompt}, futuristic, advanced technology, sleek spaceships, chrome and glass, holographic displays, distant planets, cinematic lighting, epic scale, highly detailed',
    negative: 'medieval, rustic, old-fashioned, low quality, blurry, deformed, ugly, text' },
  { name: 'Line Art', group: 'illustration', hint: 'generate.styles.hints.line_art',
    template: 'line art drawing {prompt}, professional, sleek, modern, minimalist, graphic, line art, vector graphics',
    negative: 'anime, photorealistic, 35mm film, deformed, glitch, blurry, noisy, bad anatomy, ugly, disfigured, realism, oil, acrylic' },
  { name: 'Neon Punk', group: 'stylized', hint: 'generate.styles.hints.neon_punk',
    template: 'neonpunk style {prompt}, cyberpunk, vaporwave, neon, vibrant, crisp, detailed, sleek, ultramodern, magenta highlights, dark purple shadows, high contrast, cinematic, intricate',
    negative: 'painting, drawing, illustration, glitch, deformed, mutated, cross-eyed, ugly, disfigured' },
  { name: 'Isometric', group: 'stylized', hint: 'generate.styles.hints.isometric',
    template: 'isometric style {prompt}, vibrant, beautiful, crisp, detailed, ultra detailed, intricate',
    negative: 'deformed, mutated, ugly, disfigured, blur, blurry, noise, noisy, realistic, photographic' },
  { name: 'Pixel Art', group: 'stylized', hint: 'generate.styles.hints.pixel_art',
    template: 'pixel-art {prompt}, low-res, blocky, pixel art style, 8-bit graphics',
    negative: 'sloppy, messy, blurry, noisy, highly detailed, ultra textured, photo, realistic' },
  { name: 'Tile Texture', group: 'stylized', hint: 'generate.styles.hints.tile_texture',
    template: 'texture {prompt}, top down close-up',
    negative: 'ugly, deformed, noisy, blurry' },
  { name: '3D Model', group: 'craft', hint: 'generate.styles.hints.3d_model',
    template: 'professional 3d model {prompt}, octane render, highly detailed, volumetric, dramatic lighting',
    negative: 'ugly, deformed, noisy, low poly, blurry, painting' },
  { name: 'Low Poly', group: 'craft', hint: 'generate.styles.hints.low_poly',
    template: 'low-poly style {prompt}, low-poly game art, polygon mesh, jagged, blocky, wireframe edges, centered composition',
    negative: 'noisy, sloppy, messy, grainy, highly detailed, ultra textured, photo' },
  { name: 'Origami', group: 'craft', hint: 'generate.styles.hints.origami',
    template: 'origami style {prompt}, paper art, pleated paper, folded, origami art, pleats, cut and fold, centered composition',
    negative: 'noisy, sloppy, messy, grainy, highly detailed, ultra textured, photo' },
  { name: 'Modeling Compound', group: 'craft', hint: 'generate.styles.hints.modeling_compound',
    template: 'play-doh style {prompt}, sculpture, clay art, centered composition, claymation',
    negative: 'sloppy, messy, grainy, highly detailed, ultra textured, photo' },
]

/** The file name of a style's preview picture, e.g. "Black & White" -> "black_white". */
export const styleSlug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

/** Prompt and negative prompt with the style applied; unchanged for no or an unknown style. */
export function applyStyle(name: string | undefined, prompt: string, negative = ''): { prompt: string; negative: string } {
  const style = STYLES.find((s) => s.name === name)
  if (!style || !prompt.trim()) return { prompt, negative }
  return {
    prompt: style.template.replace('{prompt}', prompt.trim()),
    negative: [negative.trim(), style.negative].filter(Boolean).join(', '),
  }
}
