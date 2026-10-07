// ─────────────────────────────────────────────
//  Al-Jin · lib/audio-effects.js
//  ffmpeg -af chains for the voice-effect commands (modules/x-effects.js).
//  Every chain starts with aresample=44100 so asetrate maths is right for any input rate.
//  `needs` lists ffmpeg filters that some minimal builds omit.
// ─────────────────────────────────────────────

const R = 'aresample=44100';

export const EFFECTS = {
    echo:      { icon: '🔁', desc: 'Adds a clear echo.',                  af: `${R},aecho=0.8:0.88:60:0.4`,                                         needs: ['aecho'] },
    reverb:    { icon: '🏛️', desc: 'Big-hall reverb.',                    af: `${R},aecho=0.8:0.9:1000|1800:0.3|0.25`,                              needs: ['aecho'] },
    nightcore: { icon: '🌙', desc: 'Faster and higher (nightcore).',      af: `${R},asetrate=44100*1.25,aresample=44100,atempo=1.1`,                needs: ['asetrate', 'atempo'] },
    chipmunk:  { icon: '🐿️', desc: 'Squeaky chipmunk voice.',             af: `${R},asetrate=44100*1.5,aresample=44100,atempo=0.6667`,              needs: ['asetrate', 'atempo'] },
    slowed:    { icon: '🐌', desc: 'Slowed + light reverb.',              af: `${R},asetrate=44100*0.85,aresample=44100,aecho=0.8:0.88:60:0.3`,     needs: ['asetrate', 'aecho'] },
    deep:      { icon: '🗿', desc: 'Deep, low voice.',                    af: `${R},asetrate=44100*0.75,aresample=44100,atempo=1.3333`,             needs: ['asetrate', 'atempo'] },
    drunk:     { icon: '🥴', desc: 'Wobbly, slurred voice.',              af: `${R},asetrate=44100*0.9,aresample=44100,atempo=1.1111,vibrato=f=3:d=0.7`, needs: ['asetrate', 'atempo', 'vibrato'] },
    fast:      { icon: '⚡', desc: 'Plays 1.5× faster, same pitch.',      af: `${R},atempo=1.5`,                                                    needs: ['atempo'] },
    tremolo:   { icon: '〰️', desc: 'Pulsing volume wobble.',              af: `${R},tremolo=f=6:d=0.8`,                                             needs: ['tremolo'] },
    distort:   { icon: '🔥', desc: 'Crunchy bit-crushed distortion.',     af: `${R},acrusher=level_in=4:level_out=2:bits=8:mode=log:aa=1`,          needs: ['acrusher'] },
};

export const EFFECT_NAMES = Object.keys(EFFECTS);
