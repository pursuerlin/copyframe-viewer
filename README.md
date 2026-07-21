# Copyframe Viewer

Copyframe Viewer is a portable desktop app for opening Copyframe interactive and complete offline webpage packages. It starts a local-only service on your computer; users do not need Python, Node.js, or a server.

## Download

Download the latest macOS or Windows build from [Releases](../../releases/latest).

- Apple Silicon Mac: choose the `arm64-mac.zip` file.
- Intel Mac: choose the `x64-mac.zip` file.
- Windows: choose the `x64-win.exe` portable app.

Extract the downloaded archive, open Copyframe Viewer, and select the unpacked offline webpage folder containing `index.html`.

## Develop

`npm install`, then run `npm run viewer:dev`. Release maintainers can create a `v*` tag to build macOS and Windows artifacts automatically.
