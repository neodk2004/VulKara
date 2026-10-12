// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (C) 2026 Oliver Schmidt
export default {
  cancel: 'Cancel',
  remove: 'Remove',
  close: 'Close',
  starting: 'Starting',
  consent: {
    yes: 'Yes, continue',
    no: 'No, cancel',
  },
  picker: {
    title: 'Choose a picture',
    fromDisk: 'From disk …',
    search: 'Search the history: prompt, model, page',
    favorites: 'Favourites',
    nothingFound: 'Nothing found.',
    empty: 'No pictures in the history yet: choose one from disk.',
  },
  start: {
    subtitle: 'Pictures and videos, generated on this Mac',
    gettingStarted: 'Getting started',
    runtime: 'Install a runtime',
    runtimeText: 'VulKara downloads the software that runs the models (Python, PyTorch or MLX) into its own folder.',
    model: 'Get a model',
    modelText: 'Models are not part of the app. You download them from Hugging Face or Civitai, or import files you already have.',
    picture: 'Create your first picture',
    pictureText: 'Describe what you want to see. Everything is computed on this Mac; nothing is sent anywhere.',
    runtimesInstalled: 'runtimes installed',
    models: 'models',
  },
  splash: {
    tagline: 'Your local AI image generator with high privacy',
    origin: 'Named after Vulcan, the Roman god of the forge, and Kára, a valkyrie of Norse legend.',
    starting: 'Starting …',
    gettingReady: 'Getting ready …',
    version: 'Version {version}',
  },
} as const
