// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
// The OpenPose skeleton as ControlNet reads it (drawn like controlnet_aux draws body, hands and face): COCO-18 body, 21 points per hand, 70 face points (68 landmarks + 2 pupils).

import type { PlainKey } from '@shared/i18n'
import { tMaybe } from '../i18n'
import { GENERATED_BODY_TEMPLATES } from './pose_templates'

export type Point = [number, number]
/** a point that is hidden or outside the picture is null */
export type Points = (Point | null)[]

export interface BodyTemplate {
  body: (number[] | null)[]
  portrait?: boolean
  /** width / height of the box a full body pose is placed in */
  aspect?: number
  face?: string
  rhand?: string
  lhand?: string
}

export const BODY_NAMES: PlainKey[] = ['pose.body.nose', 'pose.body.neck', 'pose.body.rightShoulder', 'pose.body.rightElbow', 'pose.body.rightWrist', 'pose.body.leftShoulder',
    'pose.body.leftElbow', 'pose.body.leftWrist', 'pose.body.rightHip', 'pose.body.rightKnee', 'pose.body.rightAnkle', 'pose.body.leftHip',
    'pose.body.leftKnee', 'pose.body.leftAnkle', 'pose.body.rightEye', 'pose.body.leftEye', 'pose.body.rightEar', 'pose.body.leftEar']
export const LIMBS = [[1, 2], [1, 5], [2, 3], [3, 4], [5, 6], [6, 7], [1, 8], [8, 9], [9, 10], [1, 11], [11, 12], [12, 13],
    [1, 0], [0, 14], [14, 16], [0, 15], [15, 17]]
export const BODY_COLORS = [[255, 0, 0], [255, 85, 0], [255, 170, 0], [255, 255, 0], [170, 255, 0], [85, 255, 0], [0, 255, 0],
    [0, 255, 85], [0, 255, 170], [0, 255, 255], [0, 170, 255], [0, 85, 255], [0, 0, 255], [85, 0, 255],
    [170, 0, 255], [255, 0, 255], [255, 0, 170], [255, 0, 85]]
// left/right pairs, swapped when mirroring
export const BODY_MIRROR: Record<number, number> = {2: 5, 3: 6, 4: 7, 8: 11, 9: 12, 10: 13, 14: 15, 16: 17}

export const HAND_NAMES: PlainKey[] = ['pose.hand.wrist', 'pose.hand.thumbBase', 'pose.hand.thumbMcp', 'pose.hand.thumbIp', 'pose.hand.thumbTip', 'pose.hand.indexMcp', 'pose.hand.indexPip',
    'pose.hand.indexDip', 'pose.hand.indexTip', 'pose.hand.middleMcp', 'pose.hand.middlePip', 'pose.hand.middleDip', 'pose.hand.middleTip', 'pose.hand.ringMcp',
    'pose.hand.ringPip', 'pose.hand.ringDip', 'pose.hand.ringTip', 'pose.hand.littleMcp', 'pose.hand.littlePip', 'pose.hand.littleDip', 'pose.hand.littleTip']
export const HAND_EDGES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [0, 9], [9, 10], [10, 11],
    [11, 12], [0, 13], [13, 14], [14, 15], [15, 16], [0, 17], [17, 18], [18, 19], [19, 20]]
export const HAND_POINT_COLOR = [0, 0, 255]
export const FACE_COLOR = [255, 255, 255]

// controlnet_aux colours hand edges with hsv_to_rgb([i / 20, 1, 1])
function hsvRgb(h: number): number[] {
    let i = Math.floor(h * 6), f = h * 6 - i, q = 1 - f
    let [r, g, b] = [[1, f, 0], [q, 1, 0], [0, 1, f], [0, q, 1], [f, 0, 1], [1, 0, q]][i % 6]
    return [r, g, b].map(v => Math.round(v * 255))
}
export const HAND_COLORS = HAND_EDGES.map((_e, i) => hsvRgb(i / HAND_EDGES.length))

// ------------------------------------------------------------------ hands

// finger model in hand units (wrist → middle finger tip = 1), u = towards the thumb, v = along the hand
const FINGERS = [
    // MCP base, segment lengths, spread angle (deg, + = towards the thumb)
    {base: [0.14, 0.42], len: [0.24, 0.14, 0.11], angle: 8},
    {base: [0.03, 0.45], len: [0.27, 0.16, 0.12], angle: 0},
    {base: [-0.08, 0.43], len: [0.25, 0.15, 0.11], angle: -8},
    {base: [-0.18, 0.38], len: [0.19, 0.11, 0.09], angle: -16},
]
const THUMB = {base: [0.1, 0.1], len: [0.2, 0.16, 0.13]}

// curl 0 = straight … 1 = fully bent towards the palm; order thumb, index, middle, ring, little
export const HAND_TEMPLATES: Record<string, { curl: number[]; spread: number; thumb: number }> = {
    "Open": {curl: [0, 0, 0, 0, 0], spread: 1.6, thumb: 60},
    "Relaxed": {curl: [0.3, 0.25, 0.3, 0.35, 0.4], spread: 0.7, thumb: 45},
    "Fist": {curl: [1, 1, 1, 1, 1], spread: 0, thumb: 40},
    "Pointing": {curl: [0.9, 0, 1, 1, 1], spread: 0.3, thumb: 40},
    "Peace": {curl: [0.9, 0, 0, 1, 1], spread: 1.8, thumb: 40},
    "Thumbs up": {curl: [0, 1, 1, 1, 1], spread: 0, thumb: 5},  // i18n-ok
    "OK": {curl: [0.55, 0.62, 0.05, 0.05, 0.05], spread: 1.2, thumb: 55},
    "Flat, closed": {curl: [0.1, 0, 0, 0, 0], spread: 0, thumb: 25},  // i18n-ok
    // thinker: index finger up along the cheek, thumb out under the chin, the rest curled
    "Index on cheek": {curl: [0, 0, 0.9, 0.95, 1], spread: 0.9, thumb: 75},  // i18n-ok
    // chin resting on loosely curled fingers
    "Loosely curled": {curl: [0.5, 0.75, 0.8, 0.85, 0.9], spread: 0.2, thumb: 35},  // i18n-ok
}

// 21 points in (u, v) hand units
export function handShape(name: string): Point[] {
    let t = HAND_TEMPLATES[name] || HAND_TEMPLATES["Relaxed"]
    const pts: Point[] = [[0, 0]]
    // thumb: bends sideways across the palm
    let [tu, tv] = THUMB.base
    pts.push([tu, tv])
    let a = t.thumb
    for(let k = 0; k < 3; k++) {
        if(k > 0)
            a -= t.curl[0] * 45
        let r = a * Math.PI / 180
        tu += THUMB.len[k] * Math.sin(r)
        tv += THUMB.len[k] * Math.cos(r)
        pts.push([tu, tv])
    }
    // fingers: bending towards the palm shortens them in a frontal view, a fist folds them back
    FINGERS.forEach((f, fi) => {
        let c = t.curl[fi + 1]
        let r = f.angle * t.spread * Math.PI / 180
        let dir = [Math.sin(r), Math.cos(r)]
        pts.push([f.base[0], f.base[1]])
        let along = 0, bend = 0
        f.len.forEach((l, k) => {
            bend += c * [80, 100, 60][k]
            along += l * Math.cos(bend * Math.PI / 180)
            pts.push([f.base[0] + dir[0] * along, f.base[1] + dir[1] * along])
        })
    })
    return pts
}

// places a hand at the wrist, pointing along the forearm; side "right" / "left"
export function placeHand(name: string, wrist: Point, forearmDir: number[], size: number, side: 'right' | 'left'): Point[] {
    const [dx, dy] = forearmDir
    let p = side == "right" ? [-dy, dx] : [dy, -dx]   // thumb side (palm towards the viewer)
    return handShape(name).map(([u, v]): Point => [wrist[0] + size * (u * p[0] + v * dx), wrist[1] + size * (u * p[1] + v * dy)])
}

// ------------------------------------------------------------------ face

// mean 68-point face shape (OpenFace template, 0..1 box, y down)
const FACE_68: Point[] = [[.079, .339], [.083, .457], [.097, .576], [.122, .692], [.169, .800], [.240, .896], [.326, .977],
    [.422, 1.043], [.532, 1.061], [.641, 1.040], [.738, .972], [.824, .890], [.895, .792], [.939, .682], [.961, .562],
    [.971, .442], [.971, .322], [.164, .249], [.218, .204], [.291, .192], [.367, .204], [.439, .233], [.586, .228],
    [.660, .196], [.737, .182], [.813, .193], [.871, .235], [.515, .319], [.516, .396], [.517, .474], [.518, .553],
    [.434, .604], [.476, .621], [.521, .634], [.566, .619], [.607, .602], [.252, .331], [.299, .303], [.356, .303],
    [.404, .339], [.353, .350], [.297, .350], [.631, .334], [.679, .296], [.736, .295], [.783, .321], [.740, .342],
    [.685, .344], [.353, .746], [.415, .719], [.478, .707], [.523, .717], [.570, .705], [.635, .716], [.700, .739],
    [.639, .805], [.576, .835], [.525, .842], [.476, .838], [.414, .810], [.380, .750], [.478, .745], [.523, .749],
    [.571, .743], [.672, .744], [.573, .777], [.524, .783], [.478, .778]]

// index pairs swapped when mirroring (landmarks of the other side)
export const FACE_MIRROR = (() => {
    const m: Record<number, number> = {}
    const pair = (a: number, b: number): void => { m[a] = b; m[b] = a }
    for(let i = 0; i < 8; i++) pair(i, 16 - i)
    for(let i = 0; i < 5; i++) pair(17 + i, 26 - i)
    pair(31, 35); pair(32, 34)
    pair(36, 45); pair(37, 44); pair(38, 43); pair(39, 42); pair(40, 47); pair(41, 46)
    pair(48, 54); pair(49, 53); pair(50, 52); pair(55, 59); pair(56, 58)
    pair(60, 64); pair(61, 63); pair(65, 67)
    pair(68, 69)
    return m
})()

function move(pts: Point[], idx: number[], du: number, dv: number): void {
    for(let i of idx)
        pts[i] = [pts[i][0] + du, pts[i][1] + dv]
}

const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_x, i) => a + i)

export const FACE_EXPRESSIONS: Record<string, (p: Point[]) => void> = {
    "Neutral": () => {},
    "Smile": (p) => {
        move(p, [48, 60], -0.03, -0.035); move(p, [54, 64], 0.03, -0.035)
        move(p, [49, 59, 61, 67], -0.01, -0.015); move(p, [53, 55, 63, 65], 0.01, -0.015)
        move(p, [56, 57, 58], 0, 0.01)
    },
    "Open mouth": (p) => {  // i18n-ok
        move(p, [65, 66, 67], 0, 0.07); move(p, [55, 59], 0, 0.05); move(p, [56, 57, 58], 0, 0.08)
        move(p, range(5, 11), 0, 0.04)
    },
    "Surprised": (p) => {
        FACE_EXPRESSIONS["Open mouth"](p)  // i18n-ok
        move(p, range(17, 26), 0, -0.05)
        move(p, [37, 38, 43, 44], 0, -0.015); move(p, [40, 41, 46, 47], 0, 0.01)
    },
    "Sad": (p) => {
        move(p, [48, 60], 0, 0.03); move(p, [54, 64], 0, 0.03)
        move(p, [20, 21, 22, 23], 0, -0.03)
    },
    "Eyes closed": (p) => {  // i18n-ok
        p[37] = [p[37][0], p[41][1]]; p[38] = [p[38][0], p[40][1]]
        p[43] = [p[43][0], p[47][1]]; p[44] = [p[44][0], p[46][1]]
    },
}

function mean(pts: Point[]): Point {
    return [pts.reduce((a, k) => a + k[0], 0) / pts.length, pts.reduce((a, k) => a + k[1], 0) / pts.length]
}

// 70 points in template units
export function faceShape(expression: string): Point[] {
    const p = FACE_68.map((k): Point => [k[0], k[1]]);
    (FACE_EXPRESSIONS[expression] || FACE_EXPRESSIONS["Neutral"])(p)
    p.push(mean(p.slice(36, 42)), mean(p.slice(42, 48)))   // pupils
    return p
}

const TEMPLATE_EYES = [mean(FACE_68.slice(36, 42)), mean(FACE_68.slice(42, 48))]

// fits the face so its eye centres land on the body's eye points
export function placeFace(expression: string, rightEye: Point, leftEye: Point): Point[] {
    let [a, b] = TEMPLATE_EYES
    let tmid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    let mid = [(rightEye[0] + leftEye[0]) / 2, (rightEye[1] + leftEye[1]) / 2]
    let s = Math.hypot(leftEye[0] - rightEye[0], leftEye[1] - rightEye[1]) / Math.hypot(b[0] - a[0], b[1] - a[1])
    let r = Math.atan2(leftEye[1] - rightEye[1], leftEye[0] - rightEye[0]) - Math.atan2(b[1] - a[1], b[0] - a[0])
    let cos = Math.cos(r), sin = Math.sin(r)
    return faceShape(expression).map(([x, y]): Point => {
        let u = (x - tmid[0]) * s, v = (y - tmid[1]) * s
        return [mid[0] + u * cos - v * sin, mid[1] + u * sin + v * cos]
    })
}

// ------------------------------------------------------------------ body templates

// full body: points in a 0..1 box placed in the middle of the canvas; the box is `aspect` (width / height)
// wide, 0.55 when not given (lying poses are wider than tall)
// portrait: points relative to the canvas (x / width, y / height); null = outside the picture
const BASIC_TEMPLATES: Record<string, BodyTemplate> = {
    "Standing": {body: [[.5, .12], [.5, .22], [.41, .22], [.38, .38], [.37, .52], [.59, .22], [.62, .38], [.63, .52],
        [.45, .52], [.45, .72], [.45, .92], [.55, .52], [.55, .72], [.55, .92], [.48, .1], [.52, .1], [.46, .11], [.54, .11]]},
    "T-pose": {body: [[.5, .12], [.5, .22], [.41, .22], [.28, .22], [.15, .22], [.59, .22], [.72, .22], [.85, .22],
        [.45, .52], [.45, .72], [.45, .92], [.55, .52], [.55, .72], [.55, .92], [.48, .1], [.52, .1], [.46, .11], [.54, .11]]},
    "Arms up": {body: [[.5, .18], [.5, .28], [.41, .28], [.36, .16], [.36, .03], [.59, .28], [.64, .16], [.64, .03],  // i18n-ok
        [.45, .56], [.45, .75], [.45, .94], [.55, .56], [.55, .75], [.55, .94], [.48, .16], [.52, .16], [.46, .17], [.54, .17]]},
    "Walking": {body: [[.5, .12], [.5, .22], [.42, .22], [.44, .37], [.48, .5], [.58, .22], [.6, .37], [.57, .5],
        [.46, .52], [.4, .71], [.35, .9], [.54, .52], [.58, .71], [.64, .9], [.49, .1], [.53, .1], [.47, .11], [.55, .11]]},
    "Running": {body: [[.52, .13], [.5, .23], [.42, .23], [.36, .33], [.43, .41], [.58, .23], [.64, .3], [.7, .22],
        [.46, .5], [.34, .62], [.3, .8], [.54, .5], [.64, .68], [.58, .88], [.5, .11], [.54, .11], [.48, .12], [.56, .12]]},
    "Sitting": {body: [[.5, .2], [.5, .3], [.41, .3], [.39, .45], [.45, .56], [.59, .3], [.61, .45], [.55, .56],
        [.45, .6], [.3, .62], [.3, .85], [.55, .6], [.7, .62], [.7, .85], [.48, .18], [.52, .18], [.46, .19], [.54, .19]]},
    "Portrait": {portrait: true, face: "Neutral", body: [[.5, .4], [.5, .76], [.22, .8], null, null, [.78, .8], null, null,
        null, null, null, null, null, null, [.43, .33], [.57, .33], [.35, .36], [.65, .36]]},
    "Portrait, smiling": {portrait: true, face: "Smile", body: [[.5, .4], [.5, .76], [.22, .8], null, null, [.78, .8], null,  // i18n-ok
        null, null, null, null, null, null, null, [.43, .33], [.57, .33], [.35, .36], [.65, .36]]},
    "Portrait, hand on chin": {portrait: true, face: "Neutral", rhand: "Relaxed", body: [[.52, .36], [.5, .74], [.2, .78],  // i18n-ok
        [.26, 1.0], [.45, .67], [.8, .78], null, null, null, null, null, null, null, null, [.45, .29], [.59, .29], [.37, .32], [.66, .32]]},
    "Portrait, hands at face": {portrait: true, face: "Smile", rhand: "Flat, closed", lhand: "Flat, closed",  // i18n-ok
        body: [[.5, .38], [.5, .76], [.2, .8], [.18, 1.0], [.26, .66], [.8, .8], [.82, 1.0], [.74, .66], null, null, null,
            null, null, null, [.43, .31], [.57, .31], [.35, .34], [.65, .34]]},
    "Portrait, waving": {portrait: true, face: "Smile", rhand: "Open", body: [[.55, .4], [.55, .74], [.28, .78],  // i18n-ok
        [.14, .72], [.17, .44], [.82, .78], null, null, null, null, null, null, null, null, [.48, .33], [.62, .33],
        [.4, .36], [.7, .36]]},
    "Portrait, peace sign": {portrait: true, face: "Smile", rhand: "Peace", body: [[.55, .42], [.55, .76], [.28, .8],  // i18n-ok
        [.18, .82], [.24, .5], [.82, .8], null, null, null, null, null, null, null, null, [.48, .35], [.62, .35],
        [.4, .38], [.7, .38]]},
}

// model shoot, runway, turning, bending, kneeling, lying and more portraits (generated, see pose_templates.ts)
export const BODY_TEMPLATES: Record<string, BodyTemplate> = { ...BASIC_TEMPLATES, ...GENERATED_BODY_TEMPLATES }

const slug = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+(.)?/g, (_m, c?: string) => (c ? c.toUpperCase() : ''))
/** the shown name of a body template, hand shape or face expression; the names themselves stay as they are */
export const poseLabel = (group: 'templates' | 'hands' | 'faces', name: string): string => tMaybe(`pose.${group}.${slug(name)}`, name)
