/**
 * Stock candidate pool for SameWave — 6 photos per daily theme plus
 * AT HOME and ON HOLIDAYS lifestyle buckets. Unsplash IDs are reused from
 * the mobile app's proven-loadable set where possible.
 */

/** @typedef {{ unsplashId: string, theme: string, tags: string[], subjects: string[], bucket: string, cc?: string, shapes?: string[] }} StockSpec */

const BANNED = new Set([
  "1554118811-1e0d58224f24",
  "1559056199-641a0ac8b55e",
]);

const CC = [
  "JP", "BR", "ET", "MX", "DE", "US", "IN", "FR", "GB", "AU", "CA", "IT",
  "ES", "KR", "ZA", "NG", "PH", "AR", "CO", "VN", "TH", "NL", "SE", "NO",
  "NZ", "IE", "PT", "PL", "CZ", "DK", "FI", "SG", "MY", "ID", "CL", "PE",
  "KE", "GH", "MA", "EG", "TR", "IL", "AE", "HK", "TW", "AT", "CH", "BE",
  "RO", "HU", "UA", "BD", "PK", "LK", "JO", "EC", "CR", "PA", "BO", "CU",
];

/** All daily challenge theme ids (must match mobile DAILY_CHALLENGES). */
export const DAILY_THEME_IDS = [
  "morning", "coffee", "hands", "sky", "shoes", "food", "instrument", "view",
  "movement", "pets", "reading", "commute", "listening", "plant", "work",
  "wearing", "made", "night", "water", "joy", "door", "wheels", "ritual",
  "nature", "playing", "groceries", "wall", "handwriting", "weather",
  "smallthing", "furniture", "games", "hobbies", "passions", "birds",
  "plants", "music", "selfie", "shopping", "cafe", "objects", "chores",
];

/** Unsplash photo-{id} keys grouped by visual subject. */
const POOLS = {
  morning: [
    "1495474472287-4d71bcdd2085", "1541167760496-1628856ab772",
    "1509042239860-f550ce710b93", "1521017432531-fbd92d768814",
    "1494314671902-399b18174975", "1497636577773-f1231844b336",
  ],
  coffee: [
    "1497935586351-b67a49e012bf", "1542990253-0d0f5be5f0ed",
    "1466637574441-749b8f19452f", "1495474472287-4d71bcdd2085",
    "1509042239860-f550ce710b93", "1541167760496-1628856ab772",
  ],
  cafe: [
    "1521017432531-fbd92d768814", "1494314671902-399b18174975",
    "1466637574441-749b8f19452f", "1544787219-7f47ccb76574",
    "1578662996442-48f60103fc96", "1497935586351-b67a49e012bf",
  ],
  hands: [
    "1558769132-cb1aea458c5e", "1574169208507-84376144848b",
    "1517245386807-bb43f82c33c4", "1531403009284-440f080d1e12",
    "1531746020798-e6953c6e8e04", "1636928332622-b706cd8800b5",
  ],
  sky: [
    "1559827260-dc66d52bef19", "1419242902214-272b3f66ee7a",
    "1500382017468-9049fed747ef", "1444080748397-f442aa95c3e5",
    "1419833173245-f59e1b93f9ee", "1470071459604-3b5ec3a7fe05",
  ],
  shoes: [
    "1542291026-7eec264c27ff", "1517836357463-d25dfeac3438",
    "1518611012118-696072aa579a", "1545205597-3d9d02c29597",
    "1502082553048-f009c37129b9", "1571019613454-1cb2f99b2d8b",
  ],
  food: [
    "1504674900247-0877df9cc836", "1476224203421-9ac39bcb3327",
    "1568901346375-23c9450c58cd", "1565299624946-b28f40a0ae38",
    "1551782450-a2132b4ba21d", "1565958011703-44f9829ba187",
  ],
  instrument: [
    "1516280440614-37939bbacd81", "1493225457124-a3eb161ffa5f",
    "1511671782779-c97d3d27a1d4", "1485579149621-3123dd979885",
    "1514525253161-7a46d19cd819", "1516321318423-f06f85e504b3",
  ],
  view: [
    "1497366216548-37526070297c", "1488646953014-85cb44e25828",
    "1502602898657-3e91760cbb34", "1530789253388-582c481c54b0",
    "1507525428034-b723cf961d3e", "1512100356356-de1b84283e18",
  ],
  movement: [
    "1518611012118-696072aa579a", "1517836357463-d25dfeac3438",
    "1571019613454-1cb2f99b2d8b", "1545205597-3d9d02c29597",
    "1506905925346-21bda4d32df4", "1502082553048-f009c37129b9",
  ],
  pets_dog: [
    "1587300003388-59208cc962cb", "1517423440428-a5a00ad493e8",
    "1592194996308-7b43878e84a6", "1552053831-71594a27632d",
    "1560807707-8cc77767d783", "1517841905240-472988babdf9",
  ],
  pets_cat: [
    "1548247416-ec66f4900b2e", "1573865526739-10659fec78a5",
    "1560807707-8cc77767d783", "1517841905240-472988babdf9",
    "1587300003388-59208cc962cb", "1517423440428-a5a00ad493e8",
  ],
  pets_small: [
    "1721327900409-2393c686bc48", "1738486310307-d2982bd995e6",
    "1657076761228-bdb21cf0bc7c", "1425082661705-1834bfd09dca",
    "1721327900411-b315dce4388e", "1762342672674-bc14e52572f4",
  ],
  pets_mixed: [
    "1587300003388-59208cc962cb", "1517423440428-a5a00ad493e8",
    "1548247416-ec66f4900b2e", "1573865526739-10659fec78a5",
    "1721327900409-2393c686bc48", "1657076761228-bdb21cf0bc7c",
  ],
  reading: [
    "1519681393784-d120267933ba", "1481627834876-b7833e8f5570",
    "1507003211169-0a1dd7228f2d", "1455390582262-044cdead277a",
    "1493663284031-b7e3aefcae8e", "1519710164239-da123dc03ef4",
  ],
  commute: [
    "1544620347-c4fd4a3d5957", "1513635269975-59663e0ac1ad",
    "1480714378408-67cf0d13bc1b", "1504384308090-c894fdcc538d",
    "1473625247510-8ceb1760943f", "1502920917128-1aa500764cbd",
  ],
  listening: [
    "1516321318423-f06f85e504b3", "1511671782779-c97d3d27a1d4",
    "1493225457124-a3eb161ffa5f", "1516280440614-37939bbacd81",
    "1485579149621-3123dd979885", "1514525253161-7a46d19cd819",
  ],
  plant: [
    "1416879595882-3373a0480b5b", "1497206365907-f5e630693df0",
    "1545241047-6083a3684587", "1505691938895-1758d7feb511",
    "1462536943532-57a629f6cc60", "1418065460487-3e41a6c84dc5",
  ],
  work: [
    "1557804506-669a67965ba0", "1553877522-43269d4ea984",
    "1499951360447-b19be8fe80f5", "1531403009284-440f080d1e12",
    "1517245386807-bb43f82c33c4", "1496181133206-80ce9b88a853",
  ],
  wearing: [
    "1515886657613-9f3515b0c78f", "1513475382585-d06e58bcb0e0",
    "1507003211169-0a1dd7228f2d", "1455390582262-044cdead277a",
    "1481627834876-b7833e8f5570", "1534528741775-53994a69daeb",
  ],
  made: [
    "1513475382585-d06e58bcb0e0", "1455390582262-044cdead277a",
    "1525373698358-041e3a460346", "1507003211169-0a1dd7228f2d",
    "1481627834876-b7833e8f5570", "1517242810446-cc8951b2be40",
  ],
  night: [
    "1505691938895-1758d7feb511", "1462536943532-57a629f6cc60",
    "1416879595882-3373a0480b5b", "1519710164239-da123dc03ef4",
    "1493663284031-b7e3aefcae8e", "1480714378408-67cf0d13bc1b",
  ],
  water: [
    "1521336575822-6da63fb45455", "1470770841072-f978cf4d019e",
    "1507525428034-b723cf961d3e", "1518548419970-58e3b4079ab2",
    "1532274402911-5a369e4c4bb5", "1559827260-dc66d52bef19",
  ],
  joy: [
    "1516627145497-ae6968895b74", "1541701494587-cb58502866ab",
    "1530103862676-de8c9debad1d", "1543610892-0b1f7e6d8ac1",
    "1694605735529-8d60f23a30b6", "1604518950478-98429105d1f6",
  ],
  door: [
    "1558618666-fcd25c85cd64", "1519710164239-da123dc03ef4",
    "1493663284031-b7e3aefcae8e", "1505691938895-1758d7feb511",
    "1462536943532-57a629f6cc60", "1416879595882-3373a0480b5b",
  ],
  wheels: [
    "1544620347-c4fd4a3d5957", "1513635269975-59663e0ac1ad",
    "1518611012118-696072aa579a", "1545205597-3d9d02c29597",
    "1502920917128-1aa500764cbd", "1488646953014-85cb44e25828",
  ],
  ritual: [
    "1505691938895-1758d7feb511", "1416879595882-3373a0480b5b",
    "1519710164239-da123dc03ef4", "1519681393784-d120267933ba",
    "1493663284031-b7e3aefcae8e", "1542990253-0d0f5be5f0ed",
  ],
  nature: [
    "1506905925346-21bda4d32df4", "1518548419970-58e3b4079ab2",
    "1483450388369-9ed95738483c", "1469474968028-56623f02e42e",
    "1418065460487-3e41a6c84dc5", "1470770841072-f978cf4d019e",
  ],
  playing: [
    "1529699211952-734e80c4d42b", "1516627145497-ae6968895b74",
    "1527525443983-6e60c75fff46", "1530103862676-de8c9debad1d",
    "1543610892-0b1f7e6d8ac1", "1488161628813-04466f872be2",
  ],
  groceries: [
    "1546069901-ba9599a7e63c", "1568901346375-23c9450c58cd",
    "1565299624946-b28f40a0ae38", "1540189549336-e6e99c3679fe",
    "1473093295043-cdd812d0e601", "1607082349566-187342175e2f",
  ],
  wall: [
    "1517242810446-cc8951b2be40", "1513475382585-d06e58bcb0e0",
    "1455390582262-044cdead277a", "1481627834876-b7833e8f5570",
    "1493663284031-b7e3aefcae8e", "1519710164239-da123dc03ef4",
  ],
  handwriting: [
    "1517245386807-bb43f82c33c4", "1531403009284-440f080d1e12",
    "1519681393784-d120267933ba", "1496181133206-80ce9b88a853",
    "1553877522-43269d4ea984", "1455390582262-044cdead277a",
  ],
  weather: [
    "1559827260-dc66d52bef19", "1419833173245-f59e1b93f9ee",
    "1470071459604-3b5ec3a7fe05", "1500530855697-b586d89ba3ee",
    "1532274402911-5a369e4c4bb5", "1495344517868-8ebaf0a2044a",
  ],
  smallthing: [
    "1525373698358-041e3a460346", "1517242810446-cc8951b2be40",
    "1493663284031-b7e3aefcae8e", "1542990253-0d0f5be5f0ed",
    "1516627145497-ae6968895b74", "1488161628813-04466f872be2",
  ],
  furniture: [
    "1505691938895-1758d7feb511", "1493663284031-b7e3aefcae8e",
    "1519710164239-da123dc03ef4", "1462536943532-57a629f6cc60",
    "1416879595882-3373a0480b5b", "1513475382585-d06e58bcb0e0",
  ],
  games: [
    "1529699211952-734e80c4d42b", "1516627145497-ae6968895b74",
    "1455390582262-044cdead277a", "1481627834876-b7833e8f5570",
    "1507003211169-0a1dd7228f2d", "1513475382585-d06e58bcb0e0",
  ],
  hobbies: [
    "1455390582262-044cdead277a", "1481627834876-b7833e8f5570",
    "1507003211169-0a1dd7228f2d", "1513475382585-d06e58bcb0e0",
    "1499951360447-b19be8fe80f5", "1517242810446-cc8951b2be40",
  ],
  passions: [
    "1518611012118-696072aa579a", "1517836357463-d25dfeac3438",
    "1571019613454-1cb2f99b2d8b", "1514525253161-7a46d19cd819",
    "1485579149621-3123dd979885", "1545205597-3d9d02c29597",
  ],
  birds: [
    "1452570053594-1b985d6ea890", "1444464666168-49d633b86797",
    "1472396961693-142e6e269027", "1564349683136-77e08dba1ef7",
    "1472214103451-9374bd1c798e", "1502082553048-f009c37129b9",
  ],
  plants: [
    "1416879595882-3373a0480b5b", "1497206365907-f5e630693df0",
    "1545241047-6083a3684587", "1505691938895-1758d7feb511",
    "1462536943532-57a629f6cc60", "1418065460487-3e41a6c84dc5",
  ],
  music: [
    "1493225457124-a3eb161ffa5f", "1511671782779-c97d3d27a1d4",
    "1485579149621-3123dd979885", "1514525253161-7a46d19cd819",
    "1516321318423-f06f85e504b3", "1516280440614-37939bbacd81",
  ],
  selfie: [
    "1534528741775-53994a69daeb", "1530103862676-de8c9debad1d",
    "1488161628813-04466f872be2", "1543610892-0b1f7e6d8ac1",
    "1527525443983-6e60c75fff46", "1438761681033-6461ffad8d80",
  ],
  shopping: [
    "1607082349566-187342175e2f", "1546069901-ba9599a7e63c",
    "1568901346375-23c9450c58cd", "1473093295043-cdd812d0e601",
    "1540189549336-e6e99c3679fe", "1565299624946-b28f40a0ae38",
  ],
  objects: [
    "1525373698358-041e3a460346", "1517242810446-cc8951b2be40",
    "1493663284031-b7e3aefcae8e", "1481627834876-b7833e8f5570",
    "1507003211169-0a1dd7228f2d", "1455390582262-044cdead277a",
  ],
  chores: [
    "1581578731548-c64695cc6952", "1558618666-fcd25c85cd64",
    "1505691938895-1758d7feb511", "1416879595882-3373a0480b5b",
    "1519710164239-da123dc03ef4", "1462536943532-57a629f6cc60",
  ],
  kids: [
    "1694605735529-8d60f23a30b6", "1604518950478-98429105d1f6",
    "1516627145497-ae6968895b74", "1530103862676-de8c9debad1d",
    "1543610892-0b1f7e6d8ac1", "1488161628813-04466f872be2",
  ],
  seasonal: [
    "1519710164239-da123dc03ef4", "1493663284031-b7e3aefcae8e",
    "1505691938895-1758d7feb511", "1462536943532-57a629f6cc60",
    "1416879595882-3373a0480b5b", "1516627145497-ae6968895b74",
  ],
  beach: [
    "1507525428034-b723cf961d3e", "1512100356356-de1b84283e18",
    "1505142468610-359e7d316be0", "1521336575822-6da63fb45455",
    "1470770841072-f978cf4d019e", "1518548419970-58e3b4079ab2",
  ],
  landmark: [
    "1488646953014-85cb44e25828", "1502602898657-3e91760cbb34",
    "1530789253388-582c481c54b0", "1512100356356-de1b84283e18",
    "1507525428034-b723cf961d3e", "1502920917128-1aa500764cbd",
  ],
  hotel: [
    "1505691938895-1758d7feb511", "1493663284031-b7e3aefcae8e",
    "1519710164239-da123dc03ef4", "1462536943532-57a629f6cc60",
    "1497366216548-37526070297c", "1507525428034-b723cf961d3e",
  ],
  transport_holiday: [
    "1544620347-c4fd4a3d5957", "1513635269975-59663e0ac1ad",
    "1488646953014-85cb44e25828", "1502920917128-1aa500764cbd",
    "1480714378408-67cf0d13bc1b", "1504384308090-c894fdcc538d",
  ],
  adventure: [
    "1518611012118-696072aa579a", "1517836357463-d25dfeac3438",
    "1571019613454-1cb2f99b2d8b", "1506905925346-21bda4d32df4",
    "1505142468610-359e7d316be0", "1521336575822-6da63fb45455",
  ],
  market: [
    "1555396273-367ea4eb4db5", "1556910103-1c02745aae4d",
    "1540189549336-e6e99c3679fe", "1473093295043-cdd812d0e601",
    "1607082349566-187342175e2f", "1546069901-ba9599a7e63c",
  ],
  family: [
    "1516627145497-ae6968895b74", "1527525443983-6e60c75fff46",
    "1530103862676-de8c9debad1d", "1488161628813-04466f872be2",
    "1543610892-0b1f7e6d8ac1", "1541701494587-cb58502866ab",
  ],
  diy: [
    "1581578731548-c64695cc6952", "1525373698358-041e3a460346",
    "1513475382585-d06e58bcb0e0", "1517242810446-cc8951b2be40",
    "1507003211169-0a1dd7228f2d", "1455390582262-044cdead277a",
  ],
};

const TAGS = {
  morning: ["coffee", "breakfast", "warm", "cozy", "drink"],
  coffee: ["coffee", "drink", "warm", "cafe", "tea"],
  hands: ["people", "art", "crafts", "warm"],
  sky: ["sunset", "clouds", "stars", "outdoors"],
  shoes: ["shoes", "sneakers", "feet", "outdoors"],
  food: ["meal", "food", "cooking", "warm", "drink"],
  instrument: ["music", "hobby", "art"],
  view: ["city", "outdoors", "travel", "desk"],
  movement: ["fitness", "running", "yoga", "cycling", "outdoors"],
  pets: ["dog", "cat", "animal", "pets"],
  reading: ["reading", "cozy", "home", "book"],
  commute: ["transit", "city", "travel"],
  listening: ["music", "hobby", "cozy"],
  plant: ["plants", "flowers", "garden", "home"],
  work: ["laptop", "desk", "study", "coffee"],
  wearing: ["fashion", "mirror", "people", "selfie"],
  made: ["art", "crafts", "hobby", "home"],
  night: ["night", "home", "cozy"],
  water: ["water", "outdoors", "beach"],
  joy: ["smile", "people", "celebration", "friends", "family"],
  door: ["home", "city"],
  wheels: ["transit", "cycling", "travel"],
  ritual: ["home", "cozy", "warm", "coffee"],
  nature: ["trees", "mountains", "outdoors", "beach"],
  playing: ["gaming", "play", "hobby"],
  groceries: ["grocery", "food", "meal", "shopping"],
  wall: ["art", "home"],
  handwriting: ["art", "study", "desk"],
  weather: ["rain", "clouds", "sunset", "outdoors"],
  smallthing: ["home", "cozy", "joy"],
  furniture: ["home", "cozy", "vintage"],
  games: ["gaming", "play", "hobby"],
  hobbies: ["hobby", "music", "photography", "crafts"],
  passions: ["music", "sports", "fitness", "celebration"],
  birds: ["bird", "wildlife", "animal", "outdoors"],
  plants: ["plants", "flowers", "garden"],
  music: ["music", "hobby", "cozy"],
  selfie: ["selfie", "people", "smile", "mirror"],
  shopping: ["shopping", "grocery", "food"],
  cafe: ["cafe", "coffee", "drink", "cozy"],
  objects: ["home", "vintage", "art"],
  chores: ["cleaning", "home", "chores"],
};

const SUBJECTS = {
  joy: [
    ["baby", "smile", "happy"],
    ["baby", "crying", "newborn"],
    ["smile", "celebration", "friends"],
    ["people", "laughing", "party"],
    ["family", "kids", "playing"],
    ["friends", "warm", "together"],
  ],
  hands: [
    ["hands", "coffee cup", "warm drink"],
    ["hands", "laptop", "typing"],
    ["hand writing", "notebook", "pen"],
    ["hands", "portrait", "skin"],
    ["hands together", "teamwork", "support"],
    ["hands", "pottery", "clay craft"],
  ],
  pets_dog: [
    ["dog", "pet", "outdoors"],
    ["puppy", "dog", "grass"],
    ["dog", "smile", "friend"],
    ["golden retriever", "dog"],
    ["dog", "walk", "leash"],
    ["dog", "cute", "companion"],
  ],
  pets_cat: [
    ["cat", "pet", "couch"],
    ["kitten", "cat", "cute"],
    ["cat", "window", "sunlight"],
    ["tabby cat", "pet"],
    ["cat", "eyes", "portrait"],
    ["cat", "sleeping", "cozy"],
  ],
  pets_small: [
    ["hamster", "pet", "cute"],
    ["hamster", "eating", "cage"],
    ["small pet", "rodent"],
    ["hamster", "table", "pet"],
    ["hamster", "blanket", "cute"],
    ["hamster", "portrait", "pet"],
  ],
  pets_mixed: [
    ["dog", "pet", "outdoors"],
    ["puppy", "dog", "grass"],
    ["cat", "pet", "couch"],
    ["kitten", "cat", "cute"],
    ["hamster", "pet", "cute"],
    ["hamster", "cage", "small pet"],
  ],
};

/** Lifestyle bucket definitions (6 photos each). */
export const LIFESTYLE_BUCKETS = {
  at_home_selfie: {
    theme: "selfie",
    pool: "selfie",
    tags: ["selfie", "home", "mirror", "people", "casual"],
    subjects: [
      ["selfie", "mirror", "home"],
      ["selfie", "sofa", "relaxed"],
      ["selfie", "bedroom", "casual"],
      ["mirror selfie", "outfit", "home"],
      ["selfie", "smile", "indoors"],
      ["portrait", "home", "window light"],
    ],
  },
  at_home_food: {
    theme: "food",
    pool: "food",
    tags: ["meal", "food", "cooking", "coffee", "drink", "home"],
    subjects: [
      ["dinner plate", "home cooking"],
      ["coffee mug", "kitchen"],
      ["baking", "tray", "oven"],
      ["breakfast", "table", "home"],
      ["salad bowl", "healthy meal"],
      ["pasta dish", "dinner"],
    ],
  },
  at_home_pets: {
    theme: "pets",
    pool: "pets_mixed",
    tags: ["dog", "cat", "animal", "pets", "cute"],
    subjects: [
      ["dog", "sofa", "home"],
      ["cat", "window", "home"],
      ["hamster", "cute", "pet"],
      ["puppy", "playing", "floor"],
      ["cat", "couch", "nap"],
      ["dog", "bed", "companion"],
    ],
  },
  at_home_kids: {
    theme: "joy",
    pool: "kids",
    tags: ["kids", "family", "toys", "play", "home"],
    subjects: [
      ["baby", "smile", "happy"],
      ["baby", "crying", "newborn"],
      ["kids", "crafts", "table"],
      ["homework", "child", "desk"],
      ["family", "playing", "floor"],
      ["toy blocks", "child"],
    ],
  },
  at_home_gaming: {
    theme: "games",
    pool: "games",
    tags: ["gaming", "play", "tv", "hobby", "home"],
    subjects: [
      ["game controller", "sofa"],
      ["gaming setup", "monitor", "desk"],
      ["video game", "screen", "console"],
      ["board game", "table", "friends"],
      ["chess board", "strategy game"],
      ["friends", "gaming", "couch"],
    ],
  },
  at_home_projects: {
    theme: "made",
    pool: "diy",
    tags: ["diy", "home", "crafts", "painting", "garden"],
    subjects: [
      ["paint brush", "wall", "diy"],
      ["gardening", "plants", "yard"],
      ["furniture", "rearranging", "room"],
      ["toolbox", "home repair"],
      ["sewing", "craft project"],
      ["woodworking", "hands", "project"],
    ],
  },
  at_home_seasonal: {
    theme: "joy",
    pool: "seasonal",
    tags: ["home", "celebration", "decor", "seasonal"],
    subjects: [
      ["christmas tree", "lights", "home"],
      ["halloween pumpkin", "decor"],
      ["birthday balloons", "party"],
      ["festive wreath", "door"],
      ["holiday lights", "window"],
      ["seasonal decor", "living room"],
    ],
  },
  at_home_weather_window: {
    theme: "view",
    pool: "view",
    tags: ["window", "weather", "rain", "snow", "sunset", "home"],
    subjects: [
      ["rain", "window", "drops"],
      ["snow", "window", "view"],
      ["sunset", "through glass"],
      ["cloudy sky", "window"],
      ["city view", "rainy day"],
      ["fog", "window", "morning"],
    ],
  },
  at_home_relax: {
    theme: "reading",
    pool: "reading",
    tags: ["cozy", "blanket", "book", "coffee", "candle", "home"],
    subjects: [
      ["book", "blanket", "sofa"],
      ["coffee", "candle", "cozy"],
      ["tea", "reading", "armchair"],
      ["journal", "pen", "relax"],
      ["hot drink", "winter cozy"],
      ["meditation", "calm", "home"],
    ],
  },
  at_home_wfh: {
    theme: "work",
    pool: "work",
    tags: ["laptop", "desk", "work", "home", "coffee", "notes"],
    subjects: [
      ["laptop", "desk", "home office"],
      ["notebook", "coffee", "work"],
      ["video call", "laptop"],
      ["standing desk", "monitor"],
      ["sticky notes", "planner"],
      ["keyboard", "mouse", "workspace"],
    ],
  },
  holiday_beach: {
    theme: "nature",
    pool: "beach",
    tags: ["beach", "sea", "sand", "travel", "outdoors", "sun"],
    subjects: [
      ["beach", "towel", "sand"],
      ["feet", "water", "shore"],
      ["umbrella", "beach", "sea"],
      ["ocean", "waves", "coast"],
      ["shells", "sand", "beach"],
      ["sunbathing", "beach", "relax"],
    ],
  },
  holiday_landmarks: {
    theme: "view",
    pool: "landmark",
    tags: ["travel", "landmark", "city", "architecture"],
    subjects: [
      ["famous building", "landmark"],
      ["statue", "monument", "travel"],
      ["street sign", "city"],
      ["historic architecture", "tour"],
      ["bridge", "landmark", "skyline"],
      ["tower", "cityscape", "travel"],
    ],
  },
  holiday_food: {
    theme: "food",
    pool: "food",
    tags: ["food", "travel", "restaurant", "drink", "dessert"],
    subjects: [
      ["cocktail", "beach bar"],
      ["ice cream", "summer", "travel"],
      ["restaurant plate", "local food"],
      ["street food", "market"],
      ["seafood", "holiday dinner"],
      ["fresh fruit", "tropical"],
    ],
  },
  holiday_sunset: {
    theme: "sky",
    pool: "sky",
    tags: ["sunset", "sky", "travel", "golden hour", "clouds"],
    subjects: [
      ["sunset", "horizon", "ocean"],
      ["golden hour", "beach"],
      ["clouds", "pink sky"],
      ["sunset", "mountains", "travel"],
      ["silhouette", "sunset"],
      ["evening sky", "vacation"],
    ],
  },
  holiday_selfie: {
    theme: "selfie",
    pool: "selfie",
    tags: ["selfie", "travel", "mountains", "beach", "city"],
    subjects: [
      ["selfie", "mountains", "background"],
      ["selfie", "beach", "travel"],
      ["selfie", "city street", "trip"],
      ["couple selfie", "landmark"],
      ["travel selfie", "scenery"],
      ["selfie", "vacation", "smile"],
    ],
  },
  holiday_family: {
    theme: "joy",
    pool: "family",
    tags: ["family", "friends", "group", "travel", "smile"],
    subjects: [
      ["family", "group photo", "smiling"],
      ["friends", "hug", "vacation"],
      ["family", "beach", "together"],
      ["group", "arms around", "travel"],
      ["parents", "kids", "holiday"],
      ["friends", "laughing", "trip"],
    ],
  },
  holiday_hotel: {
    theme: "view",
    pool: "hotel",
    tags: ["hotel", "travel", "pool", "balcony", "vacation"],
    subjects: [
      ["hotel balcony", "view"],
      ["pool", "resort", "palm trees"],
      ["breakfast", "hotel", "table"],
      ["villa", "terrace", "ocean view"],
      ["hotel room", "bed", "travel"],
      ["infinity pool", "sunset"],
    ],
  },
  holiday_transport: {
    theme: "commute",
    pool: "transport_holiday",
    tags: ["travel", "plane", "train", "road trip", "transit"],
    subjects: [
      ["airplane wing", "sky", "clouds"],
      ["train window", "landscape"],
      ["car dashboard", "road trip"],
      ["airport", "departure", "travel"],
      ["ferry", "sea", "travel"],
      ["scooter", "city", "holiday"],
    ],
  },
  holiday_adventure: {
    theme: "movement",
    pool: "adventure",
    tags: ["hiking", "snorkel", "cycling", "adventure", "outdoors"],
    subjects: [
      ["hiking", "trail", "mountains"],
      ["snorkeling", "underwater", "sea"],
      ["cycling", "coastal road"],
      ["zip line", "forest", "adventure"],
      ["kayak", "lake", "paddle"],
      ["climbing", "outdoors", "adventure"],
    ],
  },
  holiday_souvenirs: {
    theme: "shopping",
    pool: "market",
    tags: ["market", "souvenir", "travel", "crafts", "street art"],
    subjects: [
      ["market stall", "local crafts"],
      ["souvenir", "shop", "travel"],
      ["street art", "mural", "city"],
      ["handmade crafts", "market"],
      ["spices", "market", "colorful"],
      ["local market", "fruit", "travel"],
    ],
  },
};

function uniqueIds(ids, count = 6) {
  const seen = new Set();
  const out = [];
  for (const raw of ids) {
    const id = raw.trim();
    if (!id || BANNED.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    if (out.length >= count) break;
  }
  if (out.length < count) {
    throw new Error(
      `Need ${count} unique Unsplash ids; got ${out.length} from pool of ${ids.length}`,
    );
  }
  return out;
}

function specsFromPool(theme, poolKey, bucket, tags, subjectRows) {
  const ids = uniqueIds(POOLS[poolKey] ?? POOLS[theme] ?? POOLS.joy);
  return ids.map((unsplashId, i) => ({
    unsplashId,
    theme,
    tags,
    subjects: subjectRows?.[i] ?? subjectRows?.[0] ?? [theme, "everyday"],
    bucket,
  }));
}

/** @returns {StockSpec[]} */
export function buildStockPoolManifest() {
  /** @type {StockSpec[]} */
  const all = [];

  // Daily themes — 6 each
  const dailyPoolMap = {
    morning: "morning",
    coffee: "coffee",
    hands: "hands",
    sky: "sky",
    shoes: "shoes",
    food: "food",
    instrument: "instrument",
    view: "view",
    movement: "movement",
    pets: "pets_mixed",
    reading: "reading",
    commute: "commute",
    listening: "listening",
    plant: "plant",
    work: "work",
    wearing: "wearing",
    made: "made",
    night: "night",
    water: "water",
    joy: "joy",
    door: "door",
    wheels: "wheels",
    ritual: "ritual",
    nature: "nature",
    playing: "playing",
    groceries: "groceries",
    wall: "wall",
    handwriting: "handwriting",
    weather: "weather",
    smallthing: "smallthing",
    furniture: "furniture",
    games: "games",
    hobbies: "hobbies",
    passions: "passions",
    birds: "birds",
    plants: "plants",
    music: "music",
    selfie: "selfie",
    shopping: "shopping",
    cafe: "cafe",
    objects: "objects",
    chores: "chores",
  };

  for (const theme of DAILY_THEME_IDS) {
    const poolKey = dailyPoolMap[theme] ?? theme;
    const tags = TAGS[theme] ?? [theme, "everyday"];
    let subjectRows = SUBJECTS[theme] ?? SUBJECTS[poolKey];
    if (theme === "pets") subjectRows = SUBJECTS.pets_mixed;
    all.push(
      ...specsFromPool(
        theme,
        poolKey,
        `daily_${theme}`,
        tags,
        subjectRows ??
          Array.from({ length: 6 }, (_, i) => [theme, `moment ${i + 1}`]),
      ),
    );
  }

  // Lifestyle AT HOME + ON HOLIDAYS
  for (const [key, def] of Object.entries(LIFESTYLE_BUCKETS)) {
    all.push(
      ...specsFromPool(
        def.theme,
        def.pool,
        key,
        def.tags,
        def.subjects,
      ),
    );
  }

  return all.map((s, i) => ({
    ...s,
    cc: CC[i % CC.length],
  }));
}
