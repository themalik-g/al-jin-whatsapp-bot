# Speed update (on top of streaming + .disk updates)

Copy over the same paths, restart:
- lib/stream-send.js   parallel ranged download (4 connections), parallel HLS segments, bigger buffers
- modules/x-movie.js   live MB/s in the progress message

Tune:  .setvar AIJIN_CONNS 6     (1 = off, max 8, default 4)
Memory: ≈ 2 × connections × 4 MB (default ≈ 32 MB). Falls back to one connection when the server ignores Range.
