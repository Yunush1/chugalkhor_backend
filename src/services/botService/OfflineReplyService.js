const Enums = require('../../utils/constants');

const { FRIENDLY, FUNNY, CURIOUS, QUITE } = Enums.USER.PERSONALITY;

/**
 * Fallback replies for when every AI provider is down (no credits, bad key,
 * outage). Instead of going silent — or worse, posting one hardcoded "connection
 * glitch" line — we read the topic out of the user's message and answer in the
 * bot's own voice, using the same react / ask / own-story split the AI path uses.
 *
 * These are deliberately generic *within* a topic: they have to read as a real
 * person half-listening, which is what an office chat mostly is anyway.
 */
const TOPICS = [
    {
        // "kaam bola tha karne ko, nahi kiya" — being pulled up for undone work.
        key: 'blame',
        match: /daant|daanta|dant diya|galti|mistake|blame|warning|complaint|sunaya|sunaaya|bhool gaya|bhul gaya|nahi kiya|nhi kiya|nahi hua|pending tha|kaam pending|miss kar diya|miss ho gaya|time pe nahi|bola tha/i,
        react: {
            [FUNNY]: [
                'toh ab tak zinda hai? badi baat hai 😂',
                'ek kaam late kya hua, jaise company doob gayi 😅',
                'aise hi seekhte hai bhai, tension mat le',
                'har hafte ek banda toh sunta hi hai',
                'inko lagta hai hum robot hai 😄',
                'chal, aaj tera number tha 😂',
            ],
            [FRIENDLY]: [
                'arre ho jata hai yaar, itna mat soch',
                'ek kaam pe itna drama karne ki kya zarurat thi',
                'sabse hota hai ye, tu akela nahi hai',
                'kal kar dena, khatam baat',
                'itna bura mat feel kar, insaan hai tu',
                'sabke saamne bola kya? tab zyada bura lagta hai',
            ],
            [CURIOUS]: [
                'kaunsa kaam tha? bada wala tha kya',
                'sabke saamne sunaya ya alag bulaya',
                'tune reason bataya usko?',
                'kitne din se pending tha wo',
                'ab kya bola, koi nayi deadline di?',
                'time nahi mila ya bhool gaya tha',
            ],
            [QUITE]: [
                'ho jata hai.',
                'kal kar dena.',
                'itna bada issue nahi.',
                'reason bata dena bas.',
                'chhod, aage dekh.',
            ],
        },
        ask: [
            'kaam tha kya exactly',
            'kab tak karna tha wo',
            'tune bola nahi ki busy tha',
            'aur koi tha jisne miss kiya ya sirf tu',
            'ab deadline kya di hai',
            'akele bulaya ya team ke saamne',
            'pehli baar hua ya pehle bhi ho chuka',
        ],
        own: [
            'mera bhi pichle hafte ek task reh gaya tha',
            'humare yahan toh roz koi na koi sunta hai',
            'main toh seedha reason bata deta hoon',
            'mere lead ne bhi kal hi mujhe pakda tha',
            'apne yahan pending kaam ka alag hi register hai',
        ],
    },
    {
        key: 'credit',
        match: /credit|apne naam|apna naam|meri report|mera kaam|mera idea|took credit|stole|churaya|hadap/i,
        react: {
            [FUNNY]: [
                'classic move, aisa hi hota hai har office mein 😂',
                'wah, kaam tu kare aur naam wo le',
                'promotion bhi wahi le jayega dekh lena',
            ],
            [FRIENDLY]: [
                'arre yaar ye toh galat hai bilkul',
                'itni mehnat ke baad aisa? bura laga hoga',
                'tera hi kaam tha, sabko pata hoga',
            ],
            [CURIOUS]: [
                'seriously? sabke saamne bola usne?',
                'aur kisi ne kuch nahi kaha??',
            ],
            [QUITE]: ['classic manager move.', 'mail pe documented rakh.', 'hm. politics.'],
        },
        ask: [
            'kisi ne toka nahi usko?',
            'tera naam ek baar bhi nahi liya?',
            'aur team ka reaction kya tha',
            'ye pehli baar hua ya hamesha karta hai',
        ],
        own: [
            'humare yahan bhi lead sab credit khud le leta hai',
            'mere pichle project mein exactly yahi hua tha',
            'apne office mein toh ye normal ho gaya hai ab',
        ],
    },
    {
        key: 'appraisal',
        match: /appraisal|hike|increment|promotion|rating|average|bonus|review cycle/i,
        react: {
            [FUNNY]: [
                'hike ke naam pe sirf "great work" milta hai 😂',
                'appraisal ka matlab hi hota hai umeed todna',
                'percentage sun ke hasi aayi hogi teri',
            ],
            [FRIENDLY]: [
                'yaar itna kaam kiya tune, ye toh sahi nahi',
                'bura mat maan, tera kaam sabne dekha hai',
            ],
            [CURIOUS]: [
                'kitna percent mila? bata na',
                'aur baaki team ko kya mila??',
            ],
            [QUITE]: ['expected tha.', 'switch kar le.', 'har saal same kahani.'],
        },
        ask: [
            'manager ne reason kya bataya',
            'kitna expect kar raha tha tu',
            'baaki logo ko bhi same mila kya',
        ],
        own: [
            'mera bhi 4 percent tha, inflation usse zyada hai',
            'humare yahan toh appraisal ka mail hi 3 mahine late aaya',
        ],
    },
    {
        key: 'resign',
        match: /resign|quit|notice period|switch|offer letter|interview|naukri chhod|fired|layoff|laid off|nikaal|nikal diya/i,
        react: {
            [FUNNY]: [
                'nikal le bhai, yahan kuch nahi rakha 😂',
                'resignation mail draft toh sabke pass ready rehta hai',
            ],
            [FRIENDLY]: [
                'jo bhi decide kare, tere liye best hoga',
                'himmat ka kaam hai yaar, respect',
            ],
            [CURIOUS]: [
                'kahan switch kar raha hai? package badha?',
                'kab bola manager ko? uska reaction kya tha',
            ],
            [QUITE]: ['sahi decision.', 'notice period kitna hai?', 'offer haath mein rakh pehle.'],
        },
        ask: [
            'notice period kitna hai tera',
            'naya offer aa gaya ya abhi dekh raha hai',
            'manager ko bata diya ya abhi nahi',
        ],
        own: [
            'main bhi do saal se soch raha hoon, bas ho nahi pata',
            'humare team se pichle mahine teen log nikal gaye',
        ],
    },
    {
        key: 'workload',
        match: /overtime|late night|weekend|deadline|chutti|leave|pressure|thak|burnout|workload|late tak|night shift|so nahi/i,
        react: {
            [FUNNY]: [
                'work life balance ek myth hai bhai 😂',
                'salary ek shift ki, kaam teen shift ka',
            ],
            [FRIENDLY]: [
                'yaar thoda rest le, health pehle hai',
                'weekend pe toh kam se kam off rakh',
            ],
            [CURIOUS]: [
                'roz itna late? ya aaj hi hua',
                'team mein aur bhi log ruke ya sirf tu',
            ],
            [QUITE]: ['so ja ab.', 'boundary set kar.', 'ye chalta rahega warna.'],
        },
        ask: [
            'deadline kisne di thi itni tight',
            'weekend pe bhi kaam karwa rahe hai kya',
            'team mein log kam hai kya abhi',
        ],
        own: [
            'kal main bhi gyara baje tak laptop pe tha',
            'humare yahan toh weekend ka matlab hi khatam ho gaya',
        ],
    },
    {
        key: 'hr',
        match: /\bhr\b|policy|wfh|work from home|office aana|attendance|rto|return to office/i,
        react: {
            [FUNNY]: [
                'HR ka kaam hi company ko bachana hai, tujhe nahi 😂',
                'policy sirf hamare liye hoti hai, unke liye nahi',
            ],
            [FRIENDLY]: [
                'yaar HR se baat karke kabhi kuch hota nahi',
                'itna sab jhelna padta hai, samajh sakta hoon',
            ],
            [CURIOUS]: [
                'HR ne exactly kya bola?',
                'written mein diya ya sirf bola',
            ],
            [QUITE]: ['HR company ke liye hai.', 'mail pe le lena.', 'expected.'],
        },
        ask: [
            'ye policy sabke liye hai ya sirf teri team',
            'kisi ne push back kiya kya',
        ],
        own: [
            'humare yahan bhi wfh band karke office bula liya',
            'mere office mein HR sirf policy mail bhejta hai bas',
        ],
    },
    {
        key: 'meeting',
        match: /meeting|standup|client call|review call|discussion|sync|call pe/i,
        react: {
            [FUNNY]: [
                'meeting hai ya standup comedy 😂',
                'ye meeting ek mail mein ho sakti thi',
            ],
            [FRIENDLY]: [
                'poora din meeting mein nikal jata hai yaar',
                'kaam kab kare fir banda',
            ],
            [CURIOUS]: [
                'kitni der chali? aur nikla kya usme se',
                'client ne kya bola exactly',
            ],
            [QUITE]: ['mail se ho jata.', 'time waste.', 'roz ka drama.'],
        },
        ask: [
            'kitne log the us call mein',
            'kuch decide bhi hua ya bas baat hui',
        ],
        own: [
            'mera aadha din toh standup aur sync mein jata hai',
            'humare yahan meeting ke liye pre-meeting hoti hai 😂',
        ],
    },
    {
        key: 'boss',
        match: /boss|manager|senior|team lead|\btl\b|\bpm\b|sir ne|madam ne/i,
        react: {
            [FUNNY]: [
                'har office mein ek aisa hi hota hai 😂',
                'bosses ki training hi wahi se hoti hai lagta hai',
            ],
            [FRIENDLY]: [
                'aisa boss mile toh din kharab ho jata hai',
                'tension mat le, tu apna kaam sahi kar raha hai',
            ],
            [CURIOUS]: [
                'aisa hamesha karta hai ya aaj hi mood tha',
                'tune kuch bola usko?',
            ],
            [QUITE]: ['sab jagah same hai.', 'ignore kar.', 'documented rakh.'],
        },
        ask: [
            'kis team mein hai tu',
            'exactly kya bola usne',
            'aur phir kya hua uske baad',
        ],
        own: [
            'mera lead bhi bilkul aisa hi hai yaar',
            'humare manager toh friday shaam ko kaam deta hai',
        ],
    },
    {
        key: 'colleague',
        match: /colleague|teammate|team member|wo banda|wo ladka|wo ladki|saath wala|batameez/i,
        react: {
            [FUNNY]: ['har team mein ek toh hota hi hai aisa 😂', 'aise log hi promote hote hai dekh lena'],
            [FRIENDLY]: ['aise logo se door hi raho yaar', 'tu apna kaam dekh, chhod usko'],
            [CURIOUS]: ['kaun hai? same team mein hai kya', 'aur logo ke saath bhi aisa karta hai?'],
            [QUITE]: ['distance rakh.', 'aise log har jagah hai.'],
        },
        ask: ['kab se chal raha hai ye', 'lead ko pata hai iske baare mein'],
        own: ['humare team mein bhi ek aisa hi banda hai', 'mere saath wale ne bhi yahi kiya tha'],
    },
    {
        key: 'greeting',
        match: /^\s*(hi|hey|hello|hii+|yo|sup|koi hai|kya haal|kaise ho|good morning|gm)\b/i,
        react: {
            [FUNNY]: ['aa gaya ek aur victim of corporate 😂', 'bol bhai, aaj kya hua office mein'],
            [FRIENDLY]: ['hey! kaisa chal raha hai office', 'aa jao, bolo kya scene hai'],
            [CURIOUS]: ['hi! kahan kaam karte ho?', 'bolo bolo, kuch hua kya aaj'],
            [QUITE]: ['hm. bol.', 'haan bol.'],
        },
        ask: ['kya kaam karte ho tum', 'office ka scene kaisa hai aajkal'],
        own: ['main abhi office se nikla hoon bas', 'aaj ka din toh mera bekaar gaya'],
    },
];

// Used when nothing matches — still office-flavoured, never generic AI filler.
const GENERIC = {
    react: {
        [FUNNY]: [
            "acha? office wale bhi kamaal hote hain 😂",
            "bhai ye toh roz ki kahani lag rahi hai 😂",
            "lagta hai aaj bhi drama hua 😅",
            "classic office moment 😂",
            "ye toh har company mein hota hai 😂",
            "boss log bhi na 😄",
            "office ka daily serial chalu hai lagta hai 😆",
            "ye sunke hasi aa gayi 😂",
            "full corporate vibes 😄",
            "ye scene toh familiar lag raha hai 😂"
        ],

        [FRIENDLY]: [
            "acha acha, samajh sakta hoon yaar",
            "haan yaar, aisa hota rehta hai",
            "koi na, sabke saath hota hai",
            "understandable hai yaar",
            "office life hi aisi hoti hai",
            "bas din nikalna hota hai kabhi kabhi 😅",
            "hope baaki din better gaya ho",
            "thoda frustrating hota hai ye",
            "normal hai yaar, tension mat le",
            "main relate kar sakta hoon"
        ],

        [CURIOUS]: [
            "acha? phir kya hua?",
            "matlab exactly kya hua?",
            "kis baat pe hua ye?",
            "aur bata na thoda",
            "phir tune kya kiya?",
            "kisne bola ye?",
            "interesting... detail mein bata",
            "ye kab hua?",
            "iska end kya hua?",
            "phir reaction kya tha?"
        ],

        [QUITE]: [
            "hmm.",
            "acha.",
            "samjha.",
            "ohh.",
            "theek.",
            "hmm acha.",
            "right.",
            "got it.",
            "haan.",
            "okay."
        ]
    },

    ask: [
        "aur bata, kaam kaisa chal raha hai?",
        "office ka kya scene hai aaj?",
        "aaj workload zyada tha kya?",
        "team kaisi chal rahi hai?",
        "aaj koi interesting incident hua?",
        "meeting pe meeting chal rahi hai kya? 😄",
        "boss ka mood kaisa tha aaj? 😂",
        "WFH ya office?",
        "week kaisa ja raha hai?",
        "deadline ka pressure chal raha hai?",
        "aaj productive feel hua?",
        "coffee break mili ya nahi? ☕",
        "office gossip kya chal rahi hai? 😄",
        "team mein sab theek chal raha hai?",
        "aaj kuch naya seekhne mila?",
        "aur bata, office kaisa chal raha hai?",
        "aaj ka din kaisa tha?",
        "kaam ka pressure hai kya?",
        "aaj workload zyada tha?",
        "kuch interesting hua aaj?",
        "team ka mood kaisa tha?",
        "boss ne aaj tang kiya kya? 😄",
        "WFH chal raha hai ya office?",
        "lunch time mila aaram se?",
        "chai break hui aaj?",
        "kitni meetings thi aaj? 😂",
        "deadline close hai kya?",
        "aaj productive feel hua?",
        "office mein sab theek?",
        "koi naya project mila?",
        "client ka kya scene hai?",
        "aaj coding hui ya sirf meetings? 😂",
        "office ka gossip kya chal raha hai?",
        "koi funny incident hua?",
        "week kaisa ja raha hai?",
        "office politics kam hui ya aur badh gayi? 😅",
        "aaj jaldi free ho gaye?",
        "abhi bhi kaam kar rahe ho?",
        "weekend ka wait chal raha hai? 😄",
        "office wale aaj shaant the?"
    ],

    own: [
        "mera din bhi kaafi normal gaya aaj.",
        "aaj kaafi log busy lag rahe the.",
        "lagta hai sab jagah deadlines chal rahi hain 😅",
        "kabhi kabhi bas din nikal jata hai.",
        "aaj ka mood thoda chill hai.",
        "office conversations interesting hoti hain waise 😄",
        "kaam aur chai ka combo hi best hai ☕",
        "lagta hai aaj sabhi thode busy hain.",
        "week ke end tak sab thak jaate hain 😅",
        "kabhi kabhi choti si break bhi kaafi hoti hai.",
        "mera din bhi kaafi normal gaya.",
        "aaj kaafi busy tha idhar bhi.",
        "lagta hai sabhi busy chal rahe hain.",
        "kabhi kabhi bas chai hi motivation hoti hai ☕",
        "aaj kuch naya seekhne mila.",
        "kaam toh chalta rehta hai.",
        "thoda hectic tha aaj.",
        "aaj ka mood chill hai 😄",
        "ab bas weekend ka wait hai 😂",
        "kabhi kabhi slow day bhi achha hota hai.",
        "aaj notifications kaafi aaye.",
        "din jaldi nikal gaya.",
        "thoda productive feel hua aaj.",
        "aaj zyada distractions the 😅",
        "abhi thoda relax karne ka mood hai."
    ],

    gossip: [
        "office mein gossip kabhi khatam hi nahi hoti 😄",
        "har team ka ek unofficial news channel hota hai 😂",
        "koi na koi update toh roz mil hi jaati hai.",
        "office politics se bachna bhi ek skill hai 😅",
        "chai ke saath sabse zyada discussions hote hain ☕",
        "meeting se zyada discussion meeting ke baad hota hai 😂",
        "kabhi kabhi rumors reality se fast travel karte hain 😄",
        "office mein har kisi ke paas ek story hoti hai.",
        "water cooler conversations alag hi level ki hoti hain 😄",
        "kuch log kaam se zyada updates collect karte hain 😂",
        "office mein gossip kabhi khatam nahi hoti 😂",
        "har office ka ek unofficial news channel hota hai.",
        "chai ke time sab updates mil jaate hain 😄",
        "meeting ke baad wali discussion alag hoti hai.",
        "rumors kabhi kabhi email se fast chalte hain 😂",
        "office politics har jagah hoti hai.",
        "kuch log HR se pehle sab jaan jaate hain 😄",
        "har team ka apna drama hota hai.",
        "promotion ki baat aaye toh sab active 😅",
        "office mein surprises kabhi khatam nahi hote.",
        "kabhi kisi ki resignation hi biggest news hoti hai.",
        "new joiner aate hi curiosity shuru 😂",
        "manager ka mood bhi daily update hota hai 😄",
        "har floor ki alag kahani hoti hai.",
        "pantry mein sabse interesting discussions hote hain."
    ],

    followUp: [
        "phir kya hua?",
        "uske baad?",
        "aur bata.",
        "detail mein bata na.",
        "interesting... phir?",
        "phir tune kya bola?",
        "kis wajah se?",
        "sab theek ho gaya?",
        "phir kya decide hua?",
        "aur kisi ne kuch bola?",
        "aisa pehle bhi hua hai?",
        "tumne kaise handle kiya?",
        "fir end mein kya hua?",
        "matlab issue solve hua?",
        "phir kya plan hai?"
    ],

    relatable: [
        "Monday sabko heavy lagta hai 😅",
        "Friday ka wait toh sab karte hain 😄",
        "kabhi kabhi ek email pura mood change kar deta hai 😂",
        "calendar dekh ke hi stress aa jata hai kabhi 😅",
        "meeting khatam hote hi dusri meeting 😂",
        "chai break best reset button hoti hai ☕",
        "kabhi kabhi laptop se zyada dimaag hang ho jata hai 😄",
        "work-life balance dhoondhna bhi ek project hai 😂",
        "notification ki awaaz sunte hi tension aa jaati hai 😅",
        "kabhi kabhi bas 'Done' bolna hi achievement lagta hai 😄"
    ],
    randomOffice: [
        "kabhi kabhi office WiFi bhi mood ke hisaab se chalta hai 😂",
        "coffee machine ke paas sabse interesting conversations hoti hain.",
        "reply-all email ka darr alag hi hota hai 😅",
        "meeting invite dekhte hi energy thodi kam ho jaati hai 😂",
        "kabhi kabhi laptop restart hi solution hota hai.",
        "Friday afternoon mein productivity naturally kam ho jaati hai 😄",
        "Monday morning ka alarm sabka enemy hota hai.",
        "office chair pe aadha din nikal jata hai.",
        "calendar aur inbox kabhi khali nahi lagte.",
        "login karte hi Teams/Slack ping shuru 😂",
        "office AC ya toh bahut thanda hota hai ya bilkul nahi 😄",
        "kabhi bug fix karte karte naya bug mil jata hai 😂",
        "deploy ke baad sab pray mode mein hote hain 😅",
        "production ka naam sunte hi alert mode on.",
        "standup meeting kabhi kabhi marathon lagti hai 😄",
        "code review bhi kabhi interesting hota hai.",
        "Friday evening sabka favourite time hota hai.",
        "office memes alag hi level ke hote hain 😂",
        "kabhi ek choti si bug pura din le leti hai.",
        "corporate life mein patience bhi skill hai 😄"
    ]
};
const MOVES = ['react', 'ask', 'own'];

// roomId → lines this room has recently seen. Without this the bank resets on
// every user message, so the same line comes back a message later — which is
// exactly what makes the bots read as scripted.
const recentByRoom = new Map();
const LINES_REMEMBERED_PER_ROOM = 40;
const MAX_ROOMS_TRACKED = 500;

class OfflineReplyService {

    /**
     * @param {object}   params
     * @param {object}   params.bot           Bot user doc (needs botProfile)
     * @param {string}   params.message       The message being replied to
     * @param {string}  [params.roomId]       Enables cross-message repeat avoidance
     * @param {number}  [params.replyIndex]   Position in the reply chain
     * @param {number}  [params.round]        Chain round
     * @param {string[]}[params.alreadySaid]  Lines from the current chain
     * @returns {string|null}
     */
    static generate({ bot, message = '', roomId = null, replyIndex = 0, round = 0, alreadySaid = [] }) {
        const topic = OfflineReplyService._detectTopic(message);
        const move = MOVES[(replyIndex + round) % MOVES.length];
        const personality = bot?.botProfile?.personality ?? FRIENDLY;

        // Quiet bots stay clipped, same as the AI prompt enforces.
        const maxWords = personality === QUITE ? 6 : 14;

        const exclude = [
            ...alreadySaid,
            ...(roomId ? (recentByRoom.get(String(roomId)) ?? []) : []),
        ];

        const pickFrom = (source) => OfflineReplyService._pickLine(
            OfflineReplyService._candidates(source, move, personality),
            { maxWords, exclude }
        );

        // A topic may not cover every personality — fall through to the generic bank.
        const line = pickFrom(topic) ?? pickFrom(GENERIC);

        if (line && roomId) OfflineReplyService._remember(roomId, line);
        return line;
    }

    /**
     * The generic bank carries extra pools beyond the three moves. They're all
     * variations of the same two intentions, so they widen the pool instead of
     * needing moves of their own — a bigger pool is what stops repeats.
     */
    static _candidates(source, move, personality) {
        if (move === 'react') {
            return source.react?.[personality] ?? source.react?.[FRIENDLY] ?? [];
        }
        if (move === 'ask') {
            return [...(source.ask ?? []), ...(source.followUp ?? [])];
        }
        return [
            ...(source.own ?? []),
            ...(source.relatable ?? []),
            ...(source.gossip ?? []),
            ...(source.randomOffice ?? []),
        ];
    }

    static _detectTopic(message) {
        const text = String(message ?? '');
        // Returning GENERIC itself (not a copy) keeps its extra pools available.
        return TOPICS.find(topic => topic.match.test(text)) ?? GENERIC;
    }

    static _remember(roomId, line) {
        const key = String(roomId);
        const lines = recentByRoom.get(key) ?? [];

        lines.push(line);
        if (lines.length > LINES_REMEMBERED_PER_ROOM) lines.shift();
        recentByRoom.set(key, lines);

        // Rooms are transient; drop the oldest tracked room rather than grow forever.
        if (recentByRoom.size > MAX_ROOMS_TRACKED) {
            recentByRoom.delete(recentByRoom.keys().next().value);
        }
    }

    /** Called when a room closes, so its history doesn't linger. */
    static forgetRoom(roomId) {
        recentByRoom.delete(String(roomId));
    }

    /**
     * Prefer a line that fits the length budget and hasn't been used recently;
     * fall back to the shortest unused one, then to anything at all.
     */
    static _pickLine(candidates, { maxWords, exclude = [] }) {
        if (!candidates || candidates.length === 0) return null;

        const usedRecently = new Set(
            exclude.map(line => String(line).replace(/^[^:]+:\s*/, '').trim().toLowerCase())
        );

        const unused = candidates.filter(line => !usedRecently.has(line.toLowerCase()));
        const pool = unused.length > 0 ? unused : candidates;

        const fitting = pool.filter(line => line.split(/\s+/).length <= maxWords);
        const finalPool = fitting.length > 0
            ? fitting
            : [pool.reduce((a, b) => (a.split(/\s+/).length <= b.split(/\s+/).length ? a : b))];

        return finalPool[Math.floor(Math.random() * finalPool.length)];
    }
}

module.exports = OfflineReplyService;
