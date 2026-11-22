# Aqua 26

A browser-based water polo game with a 3D campaign, character customization, and local and online shootouts.

## Run locally

Use Node.js 20 or later. No dependency installation is required.

```shell
node server.cjs
```

Open http://localhost:4196/. The browser loads Three.js from a CDN and the satellite map uses Esri World Imagery.

## Online play

Players use the same game server and join with a room code. The server listens on loopback by default. Set `HOST` and `PORT` to configure a hosted instance. Use `AQUA_RECORDS` and `AQUA_SOCIAL` to configure persistent data paths. The default standings and social data files are ignored by Git.
