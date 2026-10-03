// ─────────────────────────────────────────────
//  Al-Jin · modules/x-registry.js
//  Single table for the extras pack: verb → module/export + who may run it.
//  router.js calls runExtra() before its own switch; modules load lazily.
//
//  perm:  all    anyone (subject to bot mode)
//         group  anyone, but only inside a group
//         admin  group admins or owner, inside a group
//         owner  bot owners only (works in any chat)
// ─────────────────────────────────────────────
import { isGroup, isOwnerMsg, isSenderAdmin, reply } from '../lib/x.js';

const LOADERS = {
    group: () => import('./x-group.js'),
    bot: () => import('./x-bot.js'),
    fun: () => import('./x-fun.js'),
    tools: () => import('./x-tools.js'),
    web: () => import('./x-web.js'),
    media: () => import('./x-media.js'),
};

// [verb, module, export, perm, ...aliases]
const TABLE = [
    // group protection & automation
    ['antiword', 'group', 'antiword', 'admin', 'antibadword'],
    ['antitag', 'group', 'antitag', 'admin'],
    ['antigm', 'group', 'antigm', 'admin', 'antigstatus'],
    ['antifake', 'group', 'antifake', 'admin'],
    ['areact', 'group', 'areact', 'admin', 'autoreact'],
    ['filter', 'group', 'filter', 'admin'],
    ['stop', 'group', 'stop', 'admin'],
    ['gfilter', 'group', 'gfilter', 'owner'],
    ['gstop', 'group', 'gstop', 'owner'],
    // group tools
    ['setgname', 'group', 'setgname', 'admin'],
    ['admins', 'group', 'admins', 'group', 'listadmin'],
    ['link', 'group', 'link', 'admin', 'invitelink'],
    ['inactive', 'group', 'inactive', 'admin'],
    ['left', 'group', 'left', 'admin'],
    ['msgs', 'group', 'msgs', 'group'],
    ['common', 'group', 'common', 'owner'],
    ['poll', 'group', 'poll', 'group'],
    ['vote', 'group', 'vote', 'group'],
    ['afk', 'group', 'afk', 'all'],
    // bot control
    ['ban', 'bot', 'ban', 'owner'],
    ['unban', 'bot', 'unban', 'owner'],
    ['banlist', 'bot', 'banlist', 'owner'],
    ['pmblocker', 'bot', 'pmblocker', 'owner'],
    ['setcmd', 'bot', 'setcmd', 'owner'],
    ['delcmd', 'bot', 'delcmd', 'owner'],
    ['cmds', 'bot', 'cmds', 'owner', 'aliases'],
    ['cleartmp', 'bot', 'cleartmp', 'owner'],
    ['clearsession', 'bot', 'clearsession', 'owner'],
    ['shutdown', 'bot', 'shutdown', 'owner'],
    ['save', 'bot', 'save', 'owner'],
    ['del', 'bot', 'del', 'all', 'delete'],
    ['ison', 'bot', 'ison', 'all'],
    // fun & games
    ['8ball', 'fun', 'eightball', 'all'],
    ['ship', 'fun', 'ship', 'all'],
    ['rate', 'fun', 'rate', 'all'],
    ['compliment', 'fun', 'compliment', 'all'],
    ['insult', 'fun', 'insult', 'all', 'roast'],
    ['flirt', 'fun', 'flirt', 'all'],
    ['truth', 'fun', 'truth', 'all'],
    ['dare', 'fun', 'dare', 'all'],
    ['rps', 'fun', 'rps', 'all'],
    ['guess', 'fun', 'guess', 'all'],
    ['hangman', 'fun', 'hangman', 'all'],
    ['tictactoe', 'fun', 'tictactoe', 'group', 'ttt'],
    ['hug', 'fun', 'hug', 'all'],
    ['kiss', 'fun', 'kiss', 'all'],
    ['pat', 'fun', 'pat', 'all'],
    ['cry', 'fun', 'cry', 'all'],
    ['poke', 'fun', 'poke', 'all'],
    ['wink', 'fun', 'wink', 'all'],
    ['nom', 'fun', 'nom', 'all'],
    // tools (offline)
    ['calc', 'tools', 'calc', 'all', 'calculate'],
    ['color', 'tools', 'color', 'all', 'colour'],
    ['base64', 'tools', 'base64', 'all', 'b64'],
    ['hash', 'tools', 'hash', 'all'],
    ['morse', 'tools', 'morse', 'all'],
    ['password', 'tools', 'password', 'all', 'genpass'],
    ['uuid', 'tools', 'uuid', 'all'],
    ['age', 'tools', 'age', 'all'],
    ['bmi', 'tools', 'bmi', 'all'],
    ['time', 'tools', 'time', 'all'],
    ['budget', 'tools', 'budget', 'all'],
    ['task', 'tools', 'task', 'all', 'todo'],
    // web (free APIs)
    ['translate', 'web', 'translate', 'all', 'trt'],
    ['trivia', 'web', 'trivia', 'all'],
    ['quote', 'web', 'quote', 'all'],
    ['whois', 'web', 'whois', 'all'],
    ['github', 'web', 'github', 'all', 'git'],
    ['crypto', 'web', 'crypto', 'all'],
    ['pokedex', 'web', 'pokedex', 'all', 'pokemon'],
    ['anime', 'web', 'anime', 'all'],
    ['character', 'web', 'character', 'all'],
    // media (ffmpeg)
    ['take', 'media', 'take', 'all', 'steal'],
    ['stickercrop', 'media', 'stickercrop', 'all', 'scrop'],
    ['circle', 'media', 'circle', 'all'],
    ['attp', 'media', 'attp', 'all'],
    ['blur', 'media', 'blur', 'all'],
    ['greyscale', 'media', 'greyscale', 'all', 'grayscale', 'bw'],
    ['pixelate', 'media', 'pixelate', 'all'],
    ['speed', 'media', 'speed', 'all'],
    ['treble', 'media', 'treble', 'all'],
    ['reverse', 'media', 'reverse', 'all'],
    ['pitch', 'media', 'pitch', 'all'],
    ['avm', 'media', 'avm', 'all'],
    ['pdf', 'media', 'pdf', 'all', 'topdf'],
];

const BY_VERB = new Map();
for (const [verb, mod, fn, perm, ...aliases] of TABLE) {
    const entry = { verb, mod, fn, perm };
    BY_VERB.set(verb, entry);
    for (const a of aliases) if (!BY_VERB.has(a)) BY_VERB.set(a, entry);
}

export const hasExtra = (verb) => BY_VERB.has(String(verb).toLowerCase());
export const extraVerbs = () => [...BY_VERB.keys()];
export const extraTable = () => TABLE.map(([verb, , , perm, ...aliases]) => ({ verb, perm, aliases }));

/**
 * Runs an extras command. Returns true when the verb belongs to this pack
 * (whether it succeeded or was refused), false when the router should carry on.
 */
export async function runExtra(sock, chat, msg, verb, args) {
    const entry = BY_VERB.get(String(verb).toLowerCase());
    if (!entry) return false;

    if (entry.perm === 'owner' && !isOwnerMsg(msg)) {
        await reply(sock, chat, msg, '⛔ Owner only.');
        return true;
    }
    if ((entry.perm === 'group' || entry.perm === 'admin') && !isGroup(chat)) {
        await reply(sock, chat, msg, '❌ This command only works in groups.');
        return true;
    }
    if (entry.perm === 'admin' && !(await isSenderAdmin(sock, chat, msg))) {
        await reply(sock, chat, msg, '⛔ Group admins or owner only.');
        return true;
    }

    const mod = await LOADERS[entry.mod]();
    const fn = mod[entry.fn];
    if (typeof fn !== 'function') throw new Error(`x-registry: ${entry.mod}.${entry.fn} is missing`);
    await fn(sock, chat, msg, args);
    return true;
}
