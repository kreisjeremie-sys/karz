// KARZ v10 — config.js — Source unique de vérité
// ═══════════════════════════════════════════════════════════

export const MODELS = {
  porsche: [
    { label:'Macan',                    slug:'macan'                     },
    { label:'Macan S',                  slug:'macan-s'                   },
    { label:'Macan GTS',                slug:'macan-gts'                 },
    { label:'Macan Turbo',              slug:'macan-turbo'               },
    { label:'Cayenne',                  slug:'cayenne'                   },
    { label:'Cayenne S',                slug:'cayenne-s'                 },
    { label:'Cayenne GTS',              slug:'cayenne-gts'               },
    { label:'Cayenne Turbo',            slug:'cayenne-turbo'             },
    { label:'Cayenne Turbo S E-Hybrid', slug:'cayenne-turbo-s-e-hybrid'  },
    { label:'Cayenne E-Hybrid',         slug:'cayenne-e-hybrid'          },
    { label:'Cayenne Coupé',            slug:'cayenne-coupe'             },
    { label:'Cayenne Coupé GTS',        slug:'cayenne-coupe-gts'         },
    { label:'Cayenne Coupé Turbo GT',   slug:'cayenne-coupe-turbo-gt'    },
  ],
  landrover: [
    { label:'Defender 90',              slug:'defender-90'               },
    { label:'Defender 90 V8',           slug:'defender-90-v8'            },
    { label:'Defender 90 X',            slug:'defender-90-x'             },
    { label:'Defender 110',             slug:'defender-110'              },
    { label:'Defender 110 D300',        slug:'defender-110-d300'         },
    { label:'Defender 110 D350',        slug:'defender-110-d350'         },
    { label:'Defender 110 V8',          slug:'defender-110-v8'           },
    { label:'Defender 110 X',           slug:'defender-110-x'            },
    { label:'Defender 130',             slug:'defender-130'              },
    { label:'Range Rover',              slug:'range-rover'               },
    { label:'Range Rover SV',           slug:'range-rover-sv'            },
    { label:'Range Rover Autobiography',slug:'range-rover-autobiography' },
    { label:'Range Rover P510e',        slug:'range-rover-p510e'         },
    { label:'Range Rover Sport',        slug:'range-rover-sport'         },
    { label:'Range Rover Sport D350',   slug:'range-rover-sport-d350'    },
    { label:'Range Rover Sport P400e',  slug:'range-rover-sport-p400e'   },
    { label:'Range Rover Sport SVR',    slug:'range-rover-sport-svr'     },
    { label:'Range Rover Sport SV',     slug:'range-rover-sport-sv'      },
    { label:'Range Rover Velar',        slug:'range-rover-velar'         },
    { label:'Range Rover Velar P400e',  slug:'range-rover-velar-p400e'   },
    { label:'Range Rover Evoque',       slug:'range-rover-evoque'        },
    { label:'Range Rover Evoque P300e', slug:'range-rover-evoque-p300e'  },
  ],
};

// co2: g/km WLTP | kg: poids vide | msrp: CHF neuf par finition principale
// Sources: fiches constructeur + porsche.ch + landrover.ch 2024
// resale_p25: null → alimenté par scrape CH → Niveau 1 benchmark
//             Si null → Niveau 2 (dépréciation) utilisé automatiquement
export const SPECS = {
  // PORSCHE MACAN
  'Porsche Macan':                 { co2:210, kg:1865, msrp: 82900, msrpSrc:'porsche.ch 2024', resale_p25:null, resale_src:null },
  'Porsche Macan S':               { co2:215, kg:1895, msrp: 91500, msrpSrc:'porsche.ch 2024', resale_p25:null, resale_src:null },
  'Porsche Macan GTS':             { co2:218, kg:1910, msrp: 99800, msrpSrc:'porsche.ch 2024', resale_p25:null, resale_src:null },
  'Porsche Macan Turbo':           { co2:  0, kg:2130, msrp:118000, msrpSrc:'porsche.ch 2024', resale_p25:null, resale_src:null },
  // PORSCHE CAYENNE
  'Porsche Cayenne':               { co2:255, kg:2045, msrp: 96300, msrpSrc:'porsche.ch 2024', resale_p25:null, resale_src:null },
  'Porsche Cayenne S':             { co2:265, kg:2070, msrp:112400, msrpSrc:'porsche.ch 2024', resale_p25:null, resale_src:null },
  'Porsche Cayenne GTS':           { co2:280, kg:2095, msrp:131200, msrpSrc:'porsche.ch 2024', resale_p25:null, resale_src:null },
  'Porsche Cayenne Turbo':         { co2:295, kg:2195, msrp:165700, msrpSrc:'porsche.ch 2024', resale_p25:null, resale_src:null },
  'Porsche Cayenne Turbo S E-Hybrid':{ co2:75,kg:2270, msrp:198500, msrpSrc:'porsche.ch 2024', resale_p25:null, resale_src:null },
  'Porsche Cayenne E-Hybrid':      { co2: 60, kg:2185, msrp:108200, msrpSrc:'porsche.ch 2024', resale_p25:null, resale_src:null },
  'Porsche Cayenne Coupé':         { co2:258, kg:2065, msrp:103500, msrpSrc:'porsche.ch 2024', resale_p25:null, resale_src:null },
  'Porsche Cayenne Coupé GTS':     { co2:282, kg:2100, msrp:138900, msrpSrc:'porsche.ch 2024', resale_p25:null, resale_src:null },
  'Porsche Cayenne Coupé Turbo GT':{ co2:290, kg:2245, msrp:198500, msrpSrc:'porsche.ch 2024', resale_p25:null, resale_src:null },
  // LR DEFENDER
  'Land Rover Defender 90':        { co2:232, kg:2105, msrp: 74800, msrpSrc:'landrover.ch 2024 S D200',         resale_p25:null, resale_src:null },
  'Land Rover Defender 90 V8':     { co2:344, kg:2350, msrp:134900, msrpSrc:'landrover.ch 2024',                resale_p25:null, resale_src:null },
  'Land Rover Defender 90 X':      { co2:225, kg:2140, msrp:109900, msrpSrc:'landrover.ch 2024 X D300',         resale_p25:null, resale_src:null },
  'Land Rover Defender 110':       { co2:230, kg:2215, msrp: 79800, msrpSrc:'landrover.ch 2024 S D200',         resale_p25:null, resale_src:null },
  'Land Rover Defender 110 D300':  { co2:218, kg:2270, msrp: 91500, msrpSrc:'landrover.ch 2024 SE D300 (leasing)', resale_p25:null, resale_src:null },
  'Land Rover Defender 110 D350':  { co2:222, kg:2290, msrp: 96200, msrpSrc:'landrover.ch 2024 HSE D350',       resale_p25:null, resale_src:null },
  'Land Rover Defender 110 V8':    { co2:358, kg:2425, msrp:134900, msrpSrc:'landrover.ch 2024',                resale_p25:null, resale_src:null },
  'Land Rover Defender 110 X':     { co2:228, kg:2285, msrp:112500, msrpSrc:'landrover.ch 2024 X D350',         resale_p25:null, resale_src:null },
  'Land Rover Defender 130':       { co2:235, kg:2395, msrp: 92400, msrpSrc:'landrover.ch 2024 SE',             resale_p25:null, resale_src:null },
  // LR RANGE ROVER
  'Land Rover Range Rover':        { co2:315, kg:2520, msrp:148900, msrpSrc:'landrover.ch 2024 SE',             resale_p25:null, resale_src:null },
  'Land Rover Range Rover SV':     { co2:290, kg:2545, msrp:248000, msrpSrc:'landrover.ch 2024',                resale_p25:null, resale_src:null },
  'Land Rover Range Rover Autobiography':{ co2:295,kg:2540,msrp:198500,msrpSrc:'landrover.ch 2024',             resale_p25:null, resale_src:null },
  'Land Rover Range Rover P510e':  { co2: 30, kg:2750, msrp:168900, msrpSrc:'landrover.ch 2024 SE',             resale_p25:null, resale_src:null },
  // LR RANGE ROVER VELAR (ajouté pour matching correct des annonces)
  'Land Rover Range Rover Velar':  { co2:200, kg:1880, msrp: 79900, msrpSrc:'landrover.ch 2024 S P250',          resale_p25:null, resale_src:null },
  'Land Rover Range Rover Velar P400e':{ co2:48, kg:2090, msrp:104900, msrpSrc:'landrover.ch 2024 SE PHEV',      resale_p25:null, resale_src:null },
  // LR RANGE ROVER SPORT
  'Land Rover Range Rover Sport':  { co2:248, kg:2305, msrp: 95800, msrpSrc:'landrover.ch 2024 S',              resale_p25:null, resale_src:null },
  'Land Rover Range Rover Sport D350':{ co2:221,kg:2250,msrp:119100, msrpSrc:'landrover.ch 2024 X-Dyn.HSE D350',resale_p25:null, resale_src:null },
  'Land Rover Range Rover Sport P400e':{ co2:52,kg:2315,msrp:108900, msrpSrc:'landrover.ch 2024 SE',            resale_p25:null, resale_src:null },
  'Land Rover Range Rover Sport SVR':{ co2:338,kg:2395,msrp:168500,  msrpSrc:'landrover.ch 2024',               resale_p25:null, resale_src:null },
  'Land Rover Range Rover Sport SV':{ co2:310,kg:2380,msrp:198000,   msrpSrc:'landrover.ch 2024',               resale_p25:null, resale_src:null },
  // LR RANGE ROVER EVOQUE
  'Land Rover Range Rover Evoque': { co2:182, kg:1835, msrp: 61000, msrpSrc:'landrover.ch 2024 P160 S (leasing)', resale_p25:null, resale_src:null },
  'Land Rover Range Rover Evoque P300e':{ co2:42,kg:1915,msrp:81480, msrpSrc:'landrover.ch 2024 PHEV Dyn.HSE (leasing)', resale_p25:null, resale_src:null },
};

// ── PARAMÈTRES LÉGAUX — IMMUABLES ────────────────────────────
export const LEGAL = {
  VAT_CH:    0.081,   // LTVA + BAZG admin.ch, en vigueur 01/01/2024
  AUTO_TAX:  0.04,    // OFDF — LJAUTO
  FIXED_FEES: 180,    // CHF: 20 (douane) + 60 (expertise) + 100 (test émissions)
  CO2_TARGET_BASE: 93.6,   // g/km base 2025 — OFEN bfe.admin.ch
  CO2_COEFF:    0.0392857,  // coefficient poids OFEN
  CO2_MASS_REF: 1766,       // kg masse référence flotte 2023
  CO2_RATE:     101,        // CHF/g dépassement — OFEN 2024
  CO2_EXEMPT_MONTHS:    12,
  CO2_EXEMPT_MONTHS_KM:  6,
  CO2_EXEMPT_KM:      5000,
  VAT_BY_COUNTRY: {
    DE:0.19, FR:0.20, IT:0.22, ES:0.21,
    NL:0.21, BE:0.21, AT:0.20, PT:0.23, UK:0.20,
  },
};

// ── PARAMÈTRES OPÉRATIONNELS — modifiables par Admin ─────────
export const DEFAULTS = {
  FX:         0.94,  // EUR/CHF réel avril 2026 — mis à jour par api/fx.js
  TRANSPORT:  1500,  // CHF — estimation prudente haute
  TVA_MODE_B: false,
};

// ── DÉPRÉCIATION — Niveau 2 prix revente ─────────────────────
export const DEPRECIATION = {
  rates:       { 1:0.18, 2:0.14, 3:0.11, 4:0.09, 5:0.09 },
  rateDefault: 0.07,
  kmExcessFactor: 0.003,
  kmNormPerYear:  15000,
};

// ── SCRAPE CH ─────────────────────────────────────────────────
export const CH_SCRAPE_SLUGS = [
  { slug:'macan',              brand:'porsche',    label:'Porsche Macan'      },
  { slug:'cayenne',            brand:'porsche',    label:'Porsche Cayenne'    },
  { slug:'defender',           brand:'land-rover', label:'LR Defender'        },
  { slug:'range-rover',        brand:'land-rover', label:'Range Rover'        },
  { slug:'range-rover-sport',  brand:'land-rover', label:'Range Rover Sport'  },
  { slug:'range-rover-evoque', brand:'land-rover', label:'Range Rover Evoque' },
];

// ── MARCHÉS EU ────────────────────────────────────────────────
export const EU_MARKETS = {
  DE: { models:'all', sources:['as24','mobilede'] },
  FR: { models:'all', sources:['as24'] },
  BE: { models:['defender-110','range-rover','range-rover-sport','cayenne'], sources:['as24'] },
  ES: { models:['cayenne','macan','range-rover-sport','defender-110'],       sources:['as24'] },
};

// ── PIPELINE ──────────────────────────────────────────────────
export const PIPELINE_STATUSES = [
  { id:'watchlist',  label:'Watchlist',     color:'#185FA5', bg:'#E6F1FB' },
  { id:'contacted',  label:'Contacté',      color:'#633806', bg:'#FAEEDA' },
  { id:'discussing', label:'En discussion', color:'#3C3489', bg:'#EEEDFE' },
  { id:'offered',    label:'Offre faite',   color:'#085041', bg:'#E1F5EE' },
  { id:'agreed',     label:'Accord verbal', color:'#0F6E56', bg:'#C8F0E0' },
];

export const LOST_REASONS = [
  'Prix vendeur trop élevé',
  'Vendu à un autre acheteur',
  'Annonce retirée sans explication',
  'Problème technique / historique',
  'Logistique impossible',
  'Marge insuffisante après négociation',
  'Décision interne',
  'Autre',
];

// ── UI ────────────────────────────────────────────────────────
export const FLAGS = {
  DE:'🇩🇪', FR:'🇫🇷', IT:'🇮🇹', ES:'🇪🇸',
  NL:'🇳🇱', BE:'🇧🇪', AT:'🇦🇹', PT:'🇵🇹',
  UK:'🇬🇧', CH:'🇨🇭',
};

export const COUNTRY_NAMES = {
  DE:'Allemagne', FR:'France',  IT:'Italie',     ES:'Espagne',
  NL:'Pays-Bas',  BE:'Belgique', AT:'Autriche',   PT:'Portugal',
  UK:'Royaume-Uni', CH:'Suisse',
};

export const SITE_PATTERNS = [
  { re:/autoscout24\.(de|fr|it|es|nl|be|at|pt|ch)/i, name:'AutoScout24',
    ccMap:{de:'DE',fr:'FR',it:'IT',es:'ES',nl:'NL',be:'BE',at:'AT',pt:'PT',ch:'CH'} },
  { re:/mobile\.de/i,         name:'Mobile.de',    cc:'DE' },
  { re:/lacentrale\.fr/i,     name:'La Centrale',  cc:'FR' },
  { re:/leboncoin\.fr/i,      name:'LeBonCoin',    cc:'FR' },
  { re:/autotrader\.co\.uk/i, name:'AutoTrader UK',cc:'UK' },
  { re:/pistonheads\.com/i,   name:'PistonHeads',  cc:'UK' },
  { re:/coches\.net/i,        name:'Coches.net',   cc:'ES' },
  { re:/willhaben\.at/i,      name:'Willhaben',    cc:'AT' },
  { re:/marktplaats\.nl/i,    name:'Marktplaats',  cc:'NL' },
  { re:/standvirtual\.com/i,  name:'StandVirtual', cc:'PT' },
  { re:/subito\.it/i,         name:'Subito.it',    cc:'IT' },
  { re:/2ememain\.be/i,       name:'2eMeMain',     cc:'BE' },
];
