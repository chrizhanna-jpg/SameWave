/**
 * Generates stock-pool-curation.mjs — hand-reviewed labels for all stock
 * Unsplash images. Run: node scripts/build-stock-curation.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildStockPoolManifest } from "./stock-pool-manifest.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ALLOWED_TAGS = new Set([
  "coffee", "tea", "breakfast", "lunch", "dinner", "snack",
  "drink", "meal", "bread", "dessert", "cooking", "baking", "warm", "cafe",
  "brunch", "picnic", "restaurant", "food",
  "trees", "sunset", "clouds", "stars", "night", "mountains", "outdoors",
  "water", "beach", "snow", "plants", "flowers", "garden", "park", "lake", "sunrise", "rain",
  "dog", "cat", "animal", "wildlife", "bird", "pets",
  "people", "smile", "celebration", "family", "friends", "party", "kids",
  "birthday", "wedding", "concert",
  "art", "photography", "music", "reading", "crafts", "fashion", "museum",
  "fitness", "yoga", "hiking", "cycling", "running", "sports", "dancing", "gaming",
  "travel", "home", "vintage", "cozy", "work", "study",
  "city", "transit", "desk", "laptop",
  "hobby", "play",
  "selfie", "mirror",
  "shopping", "grocery", "parcel",
  "chores", "cleaning", "laundry",
]);

const SHAPE_TAGS = new Set([
  "circles", "curves", "lines", "vertical", "horizontal", "diagonal",
  "symmetry", "repeating", "layered", "geometric", "organic", "minimal",
  "busy", "centered", "framed",
]);

const TAG_SUBJECT_HINTS = {
  coffee: ["coffee cup", "coffee"],
  tea: ["tea cup", "tea"],
  drink: ["drink", "glass"],
  breakfast: ["breakfast", "toast"],
  meal: ["meal", "plate"],
  bread: ["bread"],
  cooking: ["cooking", "kitchen"],
  dog: ["dog", "pet"],
  cat: ["cat", "pet"],
  animal: ["animal"],
  wildlife: ["wildlife", "animal"],
  bird: ["bird"],
  people: ["people"],
  smile: ["smile"],
  laptop: ["laptop", "computer"],
  desk: ["desk", "workspace"],
  transit: ["train", "commute"],
  city: ["city", "street"],
  clouds: ["clouds", "sky"],
  sunset: ["sunset", "sky"],
  stars: ["stars", "night sky"],
  home: ["home", "room"],
  cozy: ["cozy", "blanket"],
  plants: ["plants", "greenery"],
  flowers: ["flowers"],
  garden: ["garden"],
  gaming: ["chess board", "game"],
  fitness: ["workout"],
  yoga: ["yoga mat", "yoga"],
  running: ["running shoes", "runner"],
  cycling: ["bicycle", "cycling"],
  hiking: ["hiker", "trail"],
  crafts: ["crafts", "handmade"],
  art: ["art"],
  music: ["headphones", "music"],
  photography: ["camera", "photography"],
  reading: ["book", "reading"],
  beach: ["beach", "sand"],
  water: ["water"],
  mountains: ["mountains"],
  trees: ["trees"],
  selfie: ["selfie", "portrait"],
  mirror: ["mirror", "reflection"],
  shopping: ["shopping bags", "market"],
  grocery: ["groceries", "produce"],
  cleaning: ["cleaning supplies", "vacuum"],
  chores: ["cleaning", "home"],
  fashion: ["outfit", "clothing"],
  pets: ["pet"],
  party: ["concert crowd", "party"],
  vintage: ["vintage radio", "vinyl"],
  food: ["food"],
  cafe: ["cafe", "coffee cup"],
};

/** Image-accurate overrides — keyed by Unsplash id. Highest priority. */
const OVERRIDES = {
  // ── Already hand-reviewed (keep as source of truth) ──
  "1558769132-cb1aea458c5e": {
    tags: ["coffee", "drink", "warm", "people"],
    subjects: ["hands", "coffee cup", "mug"],
    shapes: ["curves", "centered"],
  },
  "1574169208507-84376144848b": {
    tags: ["work", "laptop", "desk", "people"],
    subjects: ["hands", "laptop", "typing"],
    shapes: ["horizontal", "lines"],
  },
  "1517245386807-bb43f82c33c4": {
    tags: ["art", "crafts", "people"],
    subjects: ["hand writing", "notebook", "pen"],
    shapes: ["diagonal", "lines"],
  },
  "1531403009284-440f080d1e12": {
    tags: ["people", "art", "warm"],
    subjects: ["hands", "portrait", "skin"],
    shapes: ["curves", "centered", "organic"],
  },
  "1531746020798-e6953c6e8e04": {
    tags: ["people", "family", "friends"],
    subjects: ["hands together", "teamwork", "support"],
    shapes: ["layered", "organic"],
  },
  "1636928332622-b706cd8800b5": {
    tags: ["art", "crafts", "hobby", "people"],
    subjects: ["hands", "pottery", "clay"],
    shapes: ["curves", "organic", "centered"],
  },
  "1587300003388-59208cc962cb": {
    tags: ["dog", "pets", "animal", "outdoors"],
    subjects: ["dog", "pet", "grass"],
    shapes: ["centered", "organic"],
  },
  "1517423440428-a5a00ad493e8": {
    tags: ["dog", "pets", "animal"],
    subjects: ["puppy", "dog", "companion"],
    shapes: ["curves", "centered"],
  },
  "1548247416-ec66f4900b2e": {
    tags: ["cat", "pets", "animal", "home"],
    subjects: ["cat", "pet", "couch"],
    shapes: ["curves", "centered"],
  },
  "1573865526739-10659fec78a5": {
    tags: ["cat", "pets", "animal"],
    subjects: ["kitten", "cat", "cute"],
    shapes: ["centered", "organic"],
  },
  "1721327900409-2393c686bc48": {
    tags: ["pets", "animal"],
    subjects: ["hamster", "pet", "cute"],
    shapes: ["centered", "minimal"],
  },
  "1657076761228-bdb21cf0bc7c": {
    tags: ["pets", "animal"],
    subjects: ["hamster", "cage", "small pet"],
    shapes: ["geometric", "centered"],
  },
  "1694605735529-8d60f23a30b6": {
    tags: ["kids", "family", "smile", "people"],
    subjects: ["baby", "smile", "happy"],
    shapes: ["centered", "curves"],
  },
  "1604518950478-98429105d1f6": {
    tags: ["kids", "family", "people"],
    subjects: ["baby", "crying", "newborn"],
    shapes: ["centered", "curves"],
  },

  // ── Morning / coffee / cafe ──
  "1495474472287-4d71bcdd2085": {
    tags: ["coffee", "drink", "warm", "cafe"],
    subjects: ["coffee cup", "latte", "hands"],
    shapes: ["circles", "centered", "curves"],
  },
  "1541167760496-1628856ab772": {
    tags: ["coffee", "drink", "warm", "people"],
    subjects: ["hands", "coffee cup", "steam"],
    shapes: ["circles", "curves", "centered"],
  },
  "1509042239860-f550ce710b93": {
    tags: ["coffee", "drink", "warm", "cafe"],
    subjects: ["coffee pour", "ceramic mug", "coffee"],
    shapes: ["circles", "diagonal", "centered"],
  },
  "1521017432531-fbd92d768814": {
    tags: ["coffee", "cafe", "drink", "warm"],
    subjects: ["cafe interior", "espresso machine", "coffee"],
    shapes: ["lines", "vertical", "busy"],
  },
  "1494314671902-399b18174975": {
    tags: ["coffee", "drink", "warm", "breakfast"],
    subjects: ["coffee cup", "saucer", "table"],
    shapes: ["circles", "centered", "minimal"],
  },
  "1497935586351-b67a49e012bf": {
    tags: ["coffee", "cafe", "drink", "warm"],
    subjects: ["latte art", "coffee cup", "cafe"],
    shapes: ["circles", "centered", "curves"],
  },
  "1542990253-0d0f5be5f0ed": {
    tags: ["coffee", "drink", "warm", "cafe"],
    subjects: ["coffee cup", "foam", "mug"],
    shapes: ["circles", "centered"],
  },
  "1466637574441-749b8f19452f": {
    tags: ["coffee", "cafe", "drink", "warm"],
    subjects: ["coffee beans", "cup", "cafe"],
    shapes: ["circles", "layered", "centered"],
  },
  "1497636577773-f1231844b336": {
    tags: ["coffee", "drink", "cafe", "warm"],
    subjects: ["coffee cup", "cafe table", "espresso"],
    shapes: ["circles", "centered", "minimal"],
  },
  "1578662996442-48f60103fc96": {
    tags: ["coffee", "drink", "warm", "cafe"],
    subjects: ["coffee cup", "latte art", "wood table"],
    shapes: ["circles", "centered", "horizontal"],
  },
  "1544787219-7f47ccb76574": {
    tags: ["coffee", "breakfast", "cafe", "warm"],
    subjects: ["pour over", "coffee", "ceramic mug"],
    shapes: ["circles", "vertical", "centered"],
  },

  // ── Food ──
  "1504674900247-0877df9cc836": {
    tags: ["meal", "food", "lunch", "warm"],
    subjects: ["salad bowl", "vegetables", "food"],
    shapes: ["circles", "centered", "layered"],
  },
  "1476224203421-9ac39bcb3327": {
    tags: ["meal", "breakfast", "bread", "food"],
    subjects: ["toast", "eggs", "breakfast plate"],
    shapes: ["circles", "layered", "centered"],
  },
  "1568901346375-23c9450c58cd": {
    tags: ["meal", "lunch", "food", "restaurant"],
    subjects: ["burger", "fries", "fast food"],
    shapes: ["centered", "layered", "organic"],
  },
  "1565299624946-b28f40a0ae38": {
    tags: ["meal", "dinner", "food", "restaurant"],
    subjects: ["pizza", "cheese", "italian food"],
    shapes: ["circles", "centered", "symmetry"],
  },
  "1551782450-a2132b4ba21d": {
    tags: ["meal", "lunch", "bread", "food"],
    subjects: ["burger", "sandwich", "plate"],
    shapes: ["centered", "layered"],
  },
  "1565958011703-44f9829ba187": {
    tags: ["meal", "dessert", "food", "snack"],
    subjects: ["strawberries", "fruit", "bowl"],
    shapes: ["circles", "repeating", "centered"],
  },
  "1540189549336-e6e99c3679fe": {
    tags: ["meal", "cooking", "food", "lunch"],
    subjects: ["salad", "vegetables", "healthy food"],
    shapes: ["layered", "organic", "centered"],
  },
  "1473093295043-cdd812d0e601": {
    tags: ["meal", "lunch", "food", "bread"],
    subjects: ["pasta", "tomatoes", "basil"],
    shapes: ["circles", "centered", "organic"],
  },
  "1546069901-ba9599a7e63c": {
    tags: ["meal", "food", "grocery", "lunch"],
    subjects: ["salad bowl", "vegetables", "healthy meal"],
    shapes: ["circles", "layered", "centered"],
  },

  // ── Work / desk ──
  "1557804506-669a67965ba0": {
    tags: ["work", "laptop", "desk", "coffee"],
    subjects: ["laptop", "coffee cup", "desk"],
    shapes: ["horizontal", "lines", "centered"],
  },
  "1553877522-43269d4ea984": {
    tags: ["work", "desk", "laptop", "people"],
    subjects: ["laptop", "desk", "office"],
    shapes: ["lines", "horizontal", "geometric"],
  },
  "1499951360447-b19be8fe80f5": {
    tags: ["work", "laptop", "desk", "study"],
    subjects: ["laptop", "notebook", "desk"],
    shapes: ["horizontal", "lines", "centered"],
  },
  "1496181133206-80ce9b88a853": {
    tags: ["work", "laptop", "desk", "coffee"],
    subjects: ["laptop", "coffee", "workspace"],
    shapes: ["horizontal", "lines", "centered"],
  },

  // ── Sky / weather / nature landscapes ──
  "1559827260-dc66d52bef19": {
    tags: ["water", "clouds", "sunset", "outdoors", "rain"],
    subjects: ["ocean", "storm clouds", "horizon"],
    shapes: ["horizontal", "layered", "minimal"],
  },
  "1419242902214-272b3f66ee7a": {
    tags: ["stars", "night", "mountains", "outdoors"],
    subjects: ["milky way", "stars", "mountains"],
    shapes: ["horizontal", "layered", "minimal"],
  },
  "1500382017468-9049fed747ef": {
    tags: ["sunset", "outdoors", "trees", "warm"],
    subjects: ["sunset", "field", "silhouette trees"],
    shapes: ["horizontal", "layered", "organic"],
  },
  "1444080748397-f442aa95c3e5": {
    tags: ["sunset", "clouds", "outdoors", "warm"],
    subjects: ["sunset sky", "clouds", "orange sky"],
    shapes: ["horizontal", "layered", "minimal"],
  },
  "1419833173245-f59e1b93f9ee": {
    tags: ["sunset", "clouds", "water", "outdoors"],
    subjects: ["sunset", "lake", "reflection"],
    shapes: ["horizontal", "symmetry", "layered"],
  },
  "1470071459604-3b5ec3a7fe05": {
    tags: ["clouds", "mountains", "outdoors", "warm"],
    subjects: ["mountains", "mist", "valley"],
    shapes: ["layered", "horizontal", "organic"],
  },
  "1500530855697-b586d89ba3ee": {
    tags: ["sunset", "clouds", "outdoors"],
    subjects: ["sunset", "clouds", "sky"],
    shapes: ["horizontal", "layered", "minimal"],
  },
  "1532274402911-5a369e4c4bb5": {
    tags: ["sunset", "clouds", "water", "outdoors"],
    subjects: ["sunset", "pier", "ocean"],
    shapes: ["horizontal", "vertical", "layered"],
  },
  "1495344517868-8ebaf0a2044a": {
    tags: ["sunset", "clouds", "warm", "outdoors"],
    subjects: ["sunset", "silhouette", "sky"],
    shapes: ["horizontal", "minimal", "layered"],
  },
  "1506905925346-21bda4d32df4": {
    tags: ["mountains", "clouds", "sunset", "outdoors"],
    subjects: ["mountain peak", "snow", "alps"],
    shapes: ["horizontal", "layered", "organic"],
  },
  "1518548419970-58e3b4079ab2": {
    tags: ["sunset", "water", "outdoors", "clouds", "trees"],
    subjects: ["sunset", "lake", "trees"],
    shapes: ["horizontal", "layered", "organic"],
  },
  "1483450388369-9ed95738483c": {
    tags: ["mountains", "sunset", "clouds", "outdoors"],
    subjects: ["mountains", "sunset", "landscape"],
    shapes: ["horizontal", "layered", "organic"],
  },
  "1469474968028-56623f02e42e": {
    tags: ["mountains", "clouds", "outdoors", "sunset"],
    subjects: ["mountain range", "valley", "landscape"],
    shapes: ["horizontal", "layered", "organic"],
  },
  "1418065460487-3e41a6c84dc5": {
    tags: ["mountains", "outdoors", "trees"],
    subjects: ["mountain lake", "forest", "reflection"],
    shapes: ["horizontal", "symmetry", "organic"],
  },
  "1470770841072-f978cf4d019e": {
    tags: ["mountains", "clouds", "water", "outdoors"],
    subjects: ["river", "mountains", "valley"],
    shapes: ["horizontal", "layered", "organic"],
  },
  "1472214103451-9374bd1c798e": {
    tags: ["sunset", "clouds", "mountains", "outdoors"],
    subjects: ["mountains", "sunset", "meadow"],
    shapes: ["horizontal", "layered", "organic"],
  },
  "1502082553048-f009c37129b9": {
    tags: ["trees", "outdoors", "clouds", "warm"],
    subjects: ["forest", "path", "trees"],
    shapes: ["vertical", "lines", "organic"],
  },
  "1472396961693-142e6e269027": {
    tags: ["wildlife", "animal", "outdoors"],
    subjects: ["deer", "wildlife", "forest"],
    shapes: ["centered", "organic", "horizontal"],
  },
  "1507525428034-b723cf961d3e": {
    tags: ["beach", "water", "outdoors", "sunset"],
    subjects: ["beach", "ocean", "sand"],
    shapes: ["horizontal", "layered", "minimal"],
  },
  "1512100356356-de1b84283e18": {
    tags: ["beach", "water", "outdoors", "warm"],
    subjects: ["beach", "waves", "coast"],
    shapes: ["horizontal", "organic", "layered"],
  },
  "1505142468610-359e7d316be0": {
    tags: ["beach", "travel", "outdoors", "warm"],
    subjects: ["beach umbrella", "sand", "sea"],
    shapes: ["vertical", "centered", "horizontal"],
  },

  // ── Commute / city / travel ──
  "1544620347-c4fd4a3d5957": {
    tags: ["transit", "city", "night", "travel"],
    subjects: ["train", "railway", "commute"],
    shapes: ["vertical", "lines", "geometric"],
  },
  "1513635269975-59663e0ac1ad": {
    tags: ["city", "water", "outdoors", "sunset"],
    subjects: ["city skyline", "river", "buildings"],
    shapes: ["vertical", "lines", "horizontal"],
  },
  "1480714378408-67cf0d13bc1b": {
    tags: ["city", "transit", "night"],
    subjects: ["city lights", "skyline", "buildings"],
    shapes: ["vertical", "repeating", "geometric"],
  },
  "1504384308090-c894fdcc538d": {
    tags: ["transit", "city", "travel"],
    subjects: ["subway", "commute", "passengers"],
    shapes: ["lines", "vertical", "busy"],
  },
  "1473625247510-8ceb1760943f": {
    tags: ["city", "night", "transit"],
    subjects: ["city street", "lights", "traffic"],
    shapes: ["vertical", "lines", "busy"],
  },
  "1502920917128-1aa500764cbd": {
    tags: ["city", "transit", "night"],
    subjects: ["bicycle", "city street", "commute"],
    shapes: ["diagonal", "lines", "vertical"],
  },
  "1488646953014-85cb44e25828": {
    tags: ["travel", "city", "transit"],
    subjects: ["suitcase", "travel", "airport"],
    shapes: ["vertical", "centered", "geometric"],
  },
  "1502602898657-3e91760cbb34": {
    tags: ["travel", "city", "outdoors"],
    subjects: ["eiffel tower", "paris", "landmark"],
    shapes: ["vertical", "centered", "symmetry"],
  },
  "1530789253388-582c481c54b0": {
    tags: ["travel", "people", "warm", "city"],
    subjects: ["street", "buildings", "travel"],
    shapes: ["vertical", "lines", "busy"],
  },
  "1497366216548-37526070297c": {
    tags: ["desk", "city", "outdoors", "work"],
    subjects: ["window view", "city skyline", "desk"],
    shapes: ["vertical", "framed", "lines"],
  },

  // ── Movement / fitness ──
  "1518611012118-696072aa579a": {
    tags: ["hiking", "outdoors", "mountains", "fitness"],
    subjects: ["hiker", "backpack", "trail"],
    shapes: ["vertical", "organic", "centered"],
  },
  "1517836357463-d25dfeac3438": {
    tags: ["running", "fitness", "outdoors"],
    subjects: ["runner", "running shoes", "track"],
    shapes: ["diagonal", "horizontal", "organic"],
  },
  "1571019613454-1cb2f99b2d8b": {
    tags: ["yoga", "fitness", "outdoors"],
    subjects: ["yoga pose", "mat", "exercise"],
    shapes: ["diagonal", "curves", "centered"],
  },
  "1545205597-3d9d02c29597": {
    tags: ["cycling", "outdoors", "fitness"],
    subjects: ["bicycle", "cyclist", "road"],
    shapes: ["diagonal", "lines", "horizontal"],
  },

  // ── Shoes (1542291026 = red Nike on concrete ledge) ──
  "1542291026-7eec264c27ff": {
    tags: ["fashion", "outdoors", "city"],
    subjects: ["sneakers", "shoes", "nike"],
    shapes: ["diagonal", "centered", "minimal"],
  },

  // ── Music / listening / instrument ──
  "1516280440614-37939bbacd81": {
    tags: ["music", "hobby", "art"],
    subjects: ["acoustic guitar", "guitar", "instrument"],
    shapes: ["diagonal", "curves", "centered"],
  },
  "1516321318423-f06f85e504b3": {
    tags: ["music", "cozy", "hobby"],
    subjects: ["headphones", "music", "listening"],
    shapes: ["curves", "centered", "minimal"],
  },
  "1493225457124-a3eb161ffa5f": {
    tags: ["music", "vintage", "hobby"],
    subjects: ["vinyl record", "turntable", "music"],
    shapes: ["circles", "centered", "geometric"],
  },
  "1511671782779-c97d3d27a1d4": {
    tags: ["music", "cozy", "hobby"],
    subjects: ["headphones", "person", "listening"],
    shapes: ["curves", "centered", "organic"],
  },
  "1485579149621-3123dd979885": {
    tags: ["music", "vintage"],
    subjects: ["vintage radio", "radio", "music"],
    shapes: ["geometric", "centered", "symmetry"],
  },
  "1514525253161-7a46d19cd819": {
    tags: ["music", "party", "concert"],
    subjects: ["concert crowd", "stage lights", "music"],
    shapes: ["busy", "vertical", "layered"],
  },
  "1455390582262-044cdead277a": {
    tags: ["music", "hobby", "reading"],
    subjects: ["notebook", "pen", "writing"],
    shapes: ["lines", "diagonal", "minimal"],
  },

  // ── Reading / furniture / home ──
  "1519681393784-d120267933ba": {
    tags: ["reading", "cozy", "home"],
    subjects: ["book", "coffee", "reading nook"],
    shapes: ["centered", "layered", "horizontal"],
  },
  "1481627834876-b7833e8f5570": {
    tags: ["photography", "hobby", "art"],
    subjects: ["camera", "photography", "lens"],
    shapes: ["circles", "centered", "geometric"],
  },
  "1507003211169-0a1dd7228f2d": {
    tags: ["crafts", "hobby", "art"],
    subjects: ["paintbrush", "palette", "painting"],
    shapes: ["curves", "organic", "centered"],
  },
  "1493663284031-b7e3aefcae8e": {
    tags: ["home", "cozy"],
    subjects: ["sofa", "living room", "couch"],
    shapes: ["horizontal", "layered", "centered"],
  },
  "1519710164239-da123dc03ef4": {
    tags: ["home", "vintage"],
    subjects: ["armchair", "vintage furniture", "interior"],
    shapes: ["vertical", "centered", "symmetry"],
  },
  "1505691938895-1758d7feb511": {
    tags: ["home", "cozy", "plants"],
    subjects: ["living room", "sofa", "plants"],
    shapes: ["horizontal", "layered", "centered"],
  },
  "1416879595882-3373a0480b5b": {
    tags: ["plants", "home", "flowers"],
    subjects: ["succulent", "potted plant", "desk plant"],
    shapes: ["centered", "organic", "minimal"],
  },
  "1462536943532-57a629f6cc60": {
    tags: ["home", "cozy", "vintage", "night"],
    subjects: ["bedroom", "lamp", "bed"],
    shapes: ["vertical", "layered", "centered"],
  },
  "1529699211952-734e80c4d42b": {
    tags: ["gaming", "play", "hobby"],
    subjects: ["chess board", "chess pieces", "game"],
    shapes: ["geometric", "symmetry", "centered"],
  },

  // ── Joy / people ──
  "1516627145497-ae6968895b74": {
    tags: ["people", "smile", "warm"],
    subjects: ["child", "smile", "portrait"],
    shapes: ["curves", "organic", "centered"],
  },
  "1541701494587-cb58502866ab": {
    tags: ["water", "art", "people"],
    subjects: ["fountain", "water splash", "joy"],
    shapes: ["curves", "organic", "centered"],
  },
  "1530103862676-de8c9debad1d": {
    tags: ["people", "smile", "celebration"],
    subjects: ["balloons", "celebration", "party"],
    shapes: ["circles", "busy", "centered"],
  },
  "1543610892-0b1f7e6d8ac1": {
    tags: ["people", "smile", "celebration", "friends"],
    subjects: ["group photo", "friends", "smile"],
    shapes: ["layered", "centered", "organic"],
  },
  "1527525443983-6e60c75fff46": {
    tags: ["people", "smile", "celebration", "friends"],
    subjects: ["friends", "hug", "celebration"],
    shapes: ["layered", "organic", "centered"],
  },
  "1488161628813-04466f872be2": {
    tags: ["people", "smile", "friends"],
    subjects: ["couple", "laughing", "friends"],
    shapes: ["curves", "centered", "organic"],
  },

  // ── Pets / wildlife ──
  "1564349683136-77e08dba1ef7": {
    tags: ["wildlife", "animal", "outdoors"],
    subjects: ["penguin", "wildlife", "bird"],
    shapes: ["centered", "organic", "symmetry"],
  },

  // ── Plants ──
  "1497206365907-f5e630693df0": {
    tags: ["flowers", "plants"],
    subjects: ["succulent", "potted plant", "greenery"],
    shapes: ["centered", "organic", "minimal"],
  },
  "1545241047-6083a3684587": {
    tags: ["plants", "garden"],
    subjects: ["fern", "green leaves", "plant"],
    shapes: ["vertical", "organic", "repeating"],
  },

  // ── Birds ──
  "1452570053594-1b985d6ea890": {
    tags: ["bird", "wildlife", "outdoors"],
    subjects: ["parrot", "kea bird", "wildlife"],
    shapes: ["centered", "organic", "curves"],
  },
  "1444464666168-49d633b86797": {
    tags: ["bird", "wildlife", "animal", "outdoors"],
    subjects: ["bird", "branch", "wildlife"],
    shapes: ["centered", "organic", "minimal"],
  },

  // ── Selfie / wearing / door / shopping / chores ──
  "1438761681033-6461ffad8d80": {
    tags: ["selfie", "people", "smile"],
    subjects: ["woman", "portrait", "selfie"],
    shapes: ["centered", "curves", "framed"],
  },
  "1534528741775-53994a69daeb": {
    tags: ["selfie", "people", "smile", "fashion"],
    subjects: ["woman", "portrait", "selfie"],
    shapes: ["centered", "curves", "symmetry"],
  },
  "1515886657613-9f3515b0c78f": {
    tags: ["fashion", "people", "city"],
    subjects: ["woman", "coat", "outfit"],
    shapes: ["vertical", "centered", "minimal"],
  },
  "1558618666-fcd25c85cd64": {
    tags: ["home", "city", "art"],
    subjects: ["colorful door", "door", "facade"],
    shapes: ["vertical", "centered", "geometric"],
  },
  "1607082349566-187342175e2f": {
    tags: ["grocery", "food", "shopping"],
    subjects: ["grocery bags", "produce", "shopping"],
    shapes: ["vertical", "layered", "centered"],
  },
  "1581578731548-c64695cc6952": {
    tags: ["cleaning", "home", "chores"],
    subjects: ["vacuum cleaner", "cleaning", "home"],
    shapes: ["vertical", "centered", "lines"],
  },
  "1555396273-367ea4eb4db5": {
    tags: ["shopping", "travel", "crafts", "art"],
    subjects: ["market stall", "handmade goods", "souvenirs"],
    shapes: ["busy", "layered", "vertical"],
  },
  "1556910103-1c02745aae4d": {
    tags: ["shopping", "travel", "crafts"],
    subjects: ["souvenir shop", "gifts", "travel"],
    shapes: ["busy", "layered", "vertical"],
  },

  // ── Wall / objects / water / hobbies ──
  "1517242810446-cc8951b2be40": {
    tags: ["art", "home"],
    subjects: ["lego figure", "toy", "wall art"],
    shapes: ["centered", "minimal", "geometric"],
  },
  "1521336575822-6da63fb45455": {
    tags: ["water", "outdoors", "travel"],
    subjects: ["kayak", "lake", "paddling"],
    shapes: ["horizontal", "centered", "organic"],
  },
  "1525373698358-041e3a460346": {
    tags: ["crafts", "vintage", "home"],
    subjects: ["typewriter", "vintage", "desk"],
    shapes: ["geometric", "centered", "horizontal"],
  },
  "1513475382585-d06e58bcb0e0": {
    tags: ["art", "crafts", "hobby"],
    subjects: ["paint tubes", "art supplies", "palette"],
    shapes: ["repeating", "busy", "horizontal"],
  },
  // ── Visual curation pass (2026-06-20) ──
  "1425082661705-1834bfd09dca": {
    tags: ["pets","animal"],
    subjects: ["hamster","pet","nibbling"],
    shapes: ["centered","organic"],
  },
  "1501747315-124a0eaca060": {
    tags: ["coffee","dessert","cozy","home","plants"],
    subjects: ["coffee mug","green macarons","handwritten note","leafy branches"],
    shapes: ["circles","organic","centered","layered"],
  },
  "1502921982-f2471545c93b": {
    tags: ["city","travel","sunset","clouds"],
    subjects: ["Boston skyline","John Hancock Tower","Prudential Tower"],
    shapes: ["horizontal","layered","vertical"],
  },
  "1504705707-2159776e0146": {
    tags: ["coffee","drink","flowers","warm","home"],
    subjects: ["coffee cup","tulips","steam"],
    shapes: ["centered","layered","organic"],
  },
  "1508717903-247ad46ca533": {
    tags: ["dog","pets","animal","home"],
    subjects: ["tan dog","profile portrait","dark collar","floppy ear","whiskers"],
    shapes: ["centered","organic","minimal","horizontal"],
  },
  "1513549054-cb3611a004fe": {
    tags: ["dog","pets","animal","outdoors","flowers","play"],
    subjects: ["golden retriever","flower crown","clover flowers","grass field","tongue"],
    shapes: ["vertical","centered","organic","circles"],
  },
  "1514565131-fce0801e5785": {
    tags: ["city","travel","twilight","water","moon"],
    subjects: ["Manhattan skyline","One World Trade Center","full moon"],
    shapes: ["horizontal","layered","vertical"],
  },
  "1515868769-ad822a0c67e9": {
    tags: ["city","travel","night","stars"],
    subjects: ["Empire State Building","Manhattan night skyline","lit windows"],
    shapes: ["horizontal","layered","vertical"],
  },
  "1517841905240-472988babdf9": {
    tags: ["fashion","people","smile","city"],
    subjects: ["woman","denim jacket","glasses"],
    shapes: ["vertical","centered"],
  },
  "1519120430-a7d2287c986a": {
    tags: ["dog","pets","animal","smile"],
    subjects: ["tolling retriever","pink tongue","amber eyes","indoor wall","ginger fur"],
    shapes: ["centered","organic","curves","minimal"],
  },
  "1522992319-0365e5f11656": {
    tags: ["coffee","drink","warm"],
    subjects: ["coffee cup","pouring stream","steam","tray"],
    shapes: ["lines","vertical","centered"],
  },
  "1528809677-ac3432892018": {
    tags: ["city","travel","dusk","clouds"],
    subjects: ["Empire State Building","Manhattan skyline","skyscrapers"],
    shapes: ["vertical","layered","lines"],
  },
  "1530186947-b2039611ba08": {
    tags: ["home","plants","garden","cozy"],
    subjects: ["window","floral curtain","trees"],
    shapes: ["framed","vertical","layered"],
  },
  "1531950910-fabaa8839414": {
    tags: ["coffee","drink","breakfast","warm"],
    subjects: ["coffee cup","water glass","white table"],
    shapes: ["horizontal","minimal","centered"],
  },
  "1532178910-7815d6919875": {
    tags: ["clouds","rain","outdoors"],
    subjects: ["storm clouds","dark sky","turbulent clouds"],
    shapes: ["organic","layered","busy"],
  },
  "1541233033-cbece0bc703f": {
    tags: ["hiking","mountains","outdoors","travel"],
    subjects: ["hiking boots","Half Dome","mountain valley"],
    shapes: ["vertical","layered","organic"],
  },
  "1541560052-5e137f229371": {
    tags: ["laptop","work","people"],
    subjects: ["hands","laptop keyboard","hoodie"],
    shapes: ["diagonal","geometric","centered"],
  },
  "1542323228-002ac256e7b8": {
    tags: ["people","friends","work","party"],
    subjects: ["hands huddle","diverse group","t-shirts","lanyards"],
    shapes: ["circles","centered","repeating"],
  },
  "1542338347-4fff3276af78": {
    tags: ["coffee","cafe","people","cozy","friends"],
    subjects: ["holding hands","latte cups","wooden table","wristwatch"],
    shapes: ["circles","centered","horizontal"],
  },
  "1542376751-fd90f8f32164": {
    tags: ["sports","shopping","fashion"],
    subjects: ["soccer cleats","sneakers","store display"],
    shapes: ["repeating","busy","geometric","vertical"],
  },
  "1542378103-69afbfef7db6": {
    tags: ["city","travel","sunset","clouds"],
    subjects: ["Empire State Building","Manhattan aerial","One World Trade Center"],
    shapes: ["vertical","layered","lines"],
  },
  "1542384557-0824d90731ee": {
    tags: ["food","meal","lunch","dinner","restaurant"],
    subjects: ["gourmet burger","brioche bun","beef patty","restaurant counter"],
    shapes: ["vertical","centered","circles"],
  },
  "1542556398-95fb5b9f9b48": {
    tags: ["coffee","tea","drink","home"],
    subjects: ["stacked mugs","typography","ceramic cups"],
    shapes: ["vertical","centered","minimal","symmetry"],
  },
  "1542590943-168e4c89eeb5": {
    tags: ["music","vintage","art","hobby"],
    subjects: ["piano keys","Stehling piano","fallboard logo","antique"],
    shapes: ["horizontal","lines","geometric"],
  },
  "1542691457-cbe4df041eb2": {
    tags: ["breakfast","meal","food","drink"],
    subjects: ["granola bowl","yogurt","grapefruit"],
    shapes: ["circles","layered","centered"],
  },
  "1542804277-c1f3382ec2aa": {
    tags: ["music","concert","art","people"],
    subjects: ["snare drum","hi-hat cymbal","drummer arm"],
    shapes: ["horizontal","circles","diagonal"],
  },
  "1542838687-936f417d2f37": {
    tags: ["fashion","outdoors","people","hiking"],
    subjects: ["hiking boots","legs","jeans"],
    shapes: ["diagonal","organic","minimal"],
  },
  "1542892770-3e6a09c7a7da": {
    tags: ["dancing","people","art","fashion"],
    subjects: ["dancer","red dress","ballet shoes","black studio","satin fabric"],
    shapes: ["vertical","curves","organic","layered"],
  },
  "1543002588-bfa74002ed7e": {
    tags: ["reading","home","art","fashion"],
    subjects: ["stack of books","open magazine","book spines"],
    shapes: ["vertical","centered","minimal"],
  },
  "1543203717-1490a4230102": {
    tags: ["plants","flowers","outdoors","sunrise"],
    subjects: ["clover flowers","meadow","golden light"],
    shapes: ["vertical","organic","minimal"],
  },
  "1543233604-3baca4d35513": {
    tags: ["coffee","drink","reading","cozy"],
    subjects: ["latte art","book","espresso cup"],
    shapes: ["layered","vertical"],
  },
  "1543242188-2c083c3e6d95": {
    tags: ["dog","pets","animal","home","cozy"],
    subjects: ["mixed breed dog","plaid blanket","armchair","houseplant","striped throw"],
    shapes: ["vertical","layered","organic","repeating"],
  },
  "1543251698-10f13f004b0f": {
    tags: ["home","nature","trees","rain"],
    subjects: ["window","misty field","trees"],
    shapes: ["geometric","framed","layered"],
  },
  "1543269664-6e49e46d59a8": {
    tags: ["laptop","work","desk"],
    subjects: ["hands","laptop","smartphone","denim jacket"],
    shapes: ["horizontal","lines","geometric"],
  },
  "1543443258-92b04ad5ec6b": {
    tags: ["music","outdoors","drums","hobby"],
    subjects: ["drum kit","Pearl bass drum","wooden platform"],
    shapes: ["centered","symmetry","circles"],
  },
  "1543443374-b6fe10a6ab7b": {
    tags: ["music","outdoors","drums","hobby"],
    subjects: ["drum kit","cymbals","tan rug"],
    shapes: ["centered","symmetry","circles"],
  },
  "1543508282-5c1f427f023f": {
    tags: ["fashion","people","photography"],
    subjects: ["hand","Nike Air Force 1","sneaker"],
    shapes: ["vertical","centered","minimal"],
  },
  "1543508282-6319a3e2621f": {
    tags: ["fashion","photography","home","desk"],
    subjects: ["Nike Air Force 1","desk","globe lamp"],
    shapes: ["vertical","circles","minimal","centered"],
  },
  "1543769657-fcf1236421bc": {
    tags: ["art","vintage","reading","study"],
    subjects: ["handwritten journal","cursive text","shadow stripes"],
    shapes: ["diagonal","lines","layered"],
  },
  "1543772429-aa0652189bf7": {
    tags: ["music","people","hobby","art"],
    subjects: ["drummer","pink hair","drum kit"],
    shapes: ["vertical","diagonal","organic"],
  },
  "1543890733-4ca85c7b0cc4": {
    tags: ["beach","water","sunset","outdoors","travel"],
    subjects: ["boots","ocean waves","rocky shore"],
    shapes: ["horizontal","organic","layered"],
  },
  "1544006659-f0b21884ce1d": {
    tags: ["laptop","work","desk"],
    subjects: ["hands","laptop","computer mouse","smartphone"],
    shapes: ["horizontal","geometric","layered"],
  },
  "1544026230-488aeae72c0d": {
    tags: ["people","city","outdoors","art"],
    subjects: ["reaching hands","concrete pillars","olive jacket"],
    shapes: ["vertical","repeating","symmetry"],
  },
  "1544027993-37dbfe43562a": {
    tags: ["people","city","outdoors","art"],
    subjects: ["reaching hands","concrete pillars","memorial corridor"],
    shapes: ["vertical","repeating","symmetry"],
  },
  "1544047963-0cfb7692fd4b": {
    tags: ["coffee","drink","cafe","warm"],
    subjects: ["espresso machine","red cups","steam"],
    shapes: ["diagonal","layered","centered"],
  },
  "1544140119-e0ad950faf9e": {
    tags: ["music","concert","people","art"],
    subjects: ["drum kit","cymbal","drumstick","stage lights"],
    shapes: ["circles","diagonal","layered"],
  },
  "1544214036-5aaeb9e32d11": {
    tags: ["city","night","travel","water","clouds"],
    subjects: ["Singapore skyline","lit skyscrapers","water reflections"],
    shapes: ["horizontal","layered","vertical"],
  },
  "1544367567-0f2fcb009e0b": {
    tags: ["yoga","fitness","outdoors","sunset","water"],
    subjects: ["yoga pose","silhouette","pier"],
    shapes: ["vertical","organic","layered"],
  },
  "1544378062-0b74cc8b4713": {
    tags: ["dog","pets","animal","home","cozy"],
    subjects: ["weimaraner","grey blanket","white sheets","bed","grey wall"],
    shapes: ["vertical","centered","organic","minimal"],
  },
  "1544413660-299165566b1d": {
    tags: ["city","travel","sunset","clouds"],
    subjects: ["Los Angeles skyline","downtown skyscrapers","urban sprawl"],
    shapes: ["vertical","layered","horizontal"],
  },
  "1544421604-3866dc481244": {
    tags: ["coffee","drink","cafe","plants"],
    subjects: ["latte art","coffee cup","potted plant"],
    shapes: ["centered","curves"],
  },
  "1544421604-4bfaaeba6830": {
    tags: ["coffee","drink","work","desk"],
    subjects: ["hands","gooseneck kettle","dripper","digital scale"],
    shapes: ["vertical","lines","centered"],
  },
  "1544474579-ea812d79430d": {
    tags: ["water","beach","sunset","outdoors","travel"],
    subjects: ["hiking boots","rocky coast","ocean"],
    shapes: ["vertical","organic","layered"],
  },
  "1544551950-db18acf4c5be": {
    tags: ["home","sunset","warm","cozy"],
    subjects: ["window","sheer curtain","golden light"],
    shapes: ["framed","geometric","layered"],
  },
  "1544568100-847a948585b9": {
    tags: ["dog","pets","animal","outdoors","smile"],
    subjects: ["tolling retriever","dog","grass stalks","forest path","floppy ears"],
    shapes: ["centered","organic","curves","minimal"],
  },
  "1544568104-5b7eb8189dd4": {
    tags: ["dog","pets","animal","outdoors","trees"],
    subjects: ["tolling retriever","autumn leaves","forest ferns","collar tag","white chest"],
    shapes: ["vertical","centered","organic","layered"],
  },
  "1544632605-f7ba941bcd39": {
    tags: ["music","art","photography","home"],
    subjects: ["piano keys","Monarch piano","wooden floor","dramatic light"],
    shapes: ["diagonal","lines","repeating","geometric"],
  },
  "1544640808-32ca72ac7f37": {
    tags: ["reading","study","home","art"],
    subjects: ["library shelves","book spines","white shelves"],
    shapes: ["horizontal","repeating","lines"],
  },
  "1544716278-ca5e3f4abd8c": {
    tags: ["reading","coffee","cozy","warm"],
    subjects: ["open book","latte art","eyeglasses"],
    shapes: ["minimal","horizontal","centered"],
  },
  "1544939010-aa8b8b4c8917": {
    tags: ["outdoors","hiking","fashion","trees"],
    subjects: ["Nike Air Max 90","tree roots","forest"],
    shapes: ["organic","diagonal","layered"],
  },
  "1544982590-068dabc956dc": {
    tags: ["food","meal","lunch","snack"],
    subjects: ["salad bowl","cherry tomatoes","lettuce","olives"],
    shapes: ["circles","centered","minimal"],
  },
  "1545066230-919660a9290a": {
    tags: ["hiking","mountains","outdoors","travel"],
    subjects: ["work boots","rocky overlook","hills"],
    shapes: ["vertical","layered","organic"],
  },
  "1545262901-16886dd24850": {
    tags: ["fashion","night","city","music"],
    subjects: ["high-top sneakers","jeans","neon light"],
    shapes: ["horizontal","lines","minimal"],
  },
  "1545319261-f3760f9dd64d": {
    tags: ["coffee","reading","cozy","home","plants"],
    subjects: ["espresso cup","kinfolk book","potted plant","saucer"],
    shapes: ["layered","vertical","circles"],
  },
  "1545324053-41b04f1a8e8a": {
    tags: ["food","snack","city","night"],
    subjects: ["street food skewers","meatballs","sausages","night market"],
    shapes: ["repeating","busy","horizontal"],
  },
  "1545341122-731b14aa40f3": {
    tags: ["coffee","breakfast","bread","drink","cafe"],
    subjects: ["chemex","gooseneck kettle","bread loaf","cherries"],
    shapes: ["layered","organic","busy"],
  },
  "1545389336-cf090694435e": {
    tags: ["yoga","hiking","outdoors","mountains"],
    subjects: ["tree pose","mountains","mist"],
    shapes: ["vertical","layered","organic"],
  },
  "1545571597-3a20563b55cb": {
    tags: ["hiking","mountains","outdoors","fitness"],
    subjects: ["hiking boot","mossy rocks","mountains"],
    shapes: ["diagonal","organic","layered"],
  },
  "1545665206-b3e63670666e": {
    tags: ["coffee","drink","warm"],
    subjects: ["hand","glass carafe","blue mug","pouring stream"],
    shapes: ["lines","vertical","curves"],
  },
  "1545665225-b23b99e4d45e": {
    tags: ["coffee","drink","warm","home"],
    subjects: ["pour-over dripper","glass carafe","gooseneck kettle","steam"],
    shapes: ["vertical","layered","organic"],
  },
  "1545731939-9c302d5d27ed": {
    tags: ["coffee","drink","cafe"],
    subjects: ["latte art","black coffee cup","saucer"],
    shapes: ["circles","centered","minimal"],
  },
  "1545984929-f28d9e323a00": {
    tags: ["food","meal","warm","snack"],
    subjects: ["Korean fish cakes","tofu pouches","steaming broth","street food"],
    shapes: ["layered","repeating","organic"],
  },
  "1546058256-47154de4046c": {
    tags: ["music","art","hobby","home"],
    subjects: ["piano keys","keyboard","digital piano","close-up"],
    shapes: ["diagonal","lines","repeating"],
  },
  "1546238232-20216dec9f72": {
    tags: ["dog","pets","animal","outdoors","plants"],
    subjects: ["golden retriever puppies","green foliage","litter of puppies","five puppies"],
    shapes: ["horizontal","repeating","organic","centered"],
  },
  "1546367564-ade1880f8921": {
    tags: ["hiking","outdoors","travel","fashion"],
    subjects: ["hiking boot","rocky trail","forest"],
    shapes: ["organic","diagonal","minimal"],
  },
  "1546379753-abb7fd8cfb93": {
    tags: ["coffee","drink","water","outdoors"],
    subjects: ["coffee splash","red mug","hand"],
    shapes: ["organic","centered","busy"],
  },
  "1546410622-6c7c57e78662": {
    tags: ["music","art","close-up","moody"],
    subjects: ["piano keys","keyboard close-up","blue tint"],
    shapes: ["horizontal","lines","repeating"],
  },
  "1546447147-3fc2b8181a74": {
    tags: ["dog","pets","animal","home","cozy"],
    subjects: ["poodle mix dog","white sheets","grey blanket","bed","bedroom"],
    shapes: ["vertical","centered","organic","curves"],
  },
  "1546447208-9d7b923c0204": {
    tags: ["city","travel","sunset","water"],
    subjects: ["Manhattan skyline","twilight sky","river reflection"],
    shapes: ["horizontal","layered","lines"],
  },
  "1546452969-f97bb99cf30b": {
    tags: ["snow","outdoors","travel","photography"],
    subjects: ["boots","snow","dried leaves"],
    shapes: ["organic","centered","busy"],
  },
  "1546549032-9571cd6b27df": {
    tags: ["food","meal","dinner","cooking"],
    subjects: ["pasta carbonara","linguine","pancetta","basil leaves"],
    shapes: ["circles","layered","centered"],
  },
  "1546697266-d4cf4c9c4f97": {
    tags: ["outdoors","plants","cozy","travel"],
    subjects: ["leather boots","autumn leaves","fall foliage"],
    shapes: ["organic","symmetry","centered"],
  },
  "1546795729-f3a5d42087f5": {
    tags: ["laptop","work","travel","desk","coffee"],
    subjects: ["hands","laptop","mug","passport"],
    shapes: ["horizontal","geometric","layered"],
  },
  "1547054650-347842fc745f": {
    tags: ["water","outdoors","lake","travel"],
    subjects: ["hiking boots","shoreline","water"],
    shapes: ["diagonal","organic","minimal"],
  },
  "1547153760-18fc86324498": {
    tags: ["dancing","fitness","art","people"],
    subjects: ["contemporary dancer","white wide pants","dramatic lighting"],
    shapes: ["vertical","centered","diagonal"],
  },
  "1547240089-0b75465f8e80": {
    tags: ["coffee","drink","cafe","people"],
    subjects: ["latte art","milk pitcher","hands"],
    shapes: ["centered","curves"],
  },
  "1547240089-566513e12c89": {
    tags: ["coffee","drink","cafe","people"],
    subjects: ["latte art","barista hands","milk pitcher"],
    shapes: ["centered","curves"],
  },
  "1547321621-f79c6685a48e": {
    tags: ["food","city","people","night","smile"],
    subjects: ["food vendor","mixing bowl","night market","neon lights"],
    shapes: ["centered","busy","vertical"],
  },
  "1547321870-675cf91660d5": {
    tags: ["laptop","work","reading"],
    subjects: ["hands","laptop keyboard","eyeglasses"],
    shapes: ["geometric","centered","horizontal"],
  },
  "1547357812-4a336d835928": {
    tags: ["music","hobby","people","warm"],
    subjects: ["hands","acoustic guitar","fretboard","strings"],
    shapes: ["lines","diagonal","curves"],
  },
  "1547420410-a9b34b528f59": {
    tags: ["coffee","cafe","people","drink","work"],
    subjects: ["barista","gooseneck kettle","dripper","coffee grinder"],
    shapes: ["vertical","layered","centered"],
  },
  "1547525623-c7d42c20284c": {
    tags: ["dog","pets","animal","outdoors","play","smile"],
    subjects: ["goldendoodle","blue dog ball","green lawn","red collar","tree trunk"],
    shapes: ["vertical","centered","circles","organic"],
  },
  "1547565393-1b180d53d82a": {
    tags: ["cat","animal","home"],
    subjects: ["Exotic Shorthair cat","orange eyes","tabby fur","portrait"],
    shapes: ["centered","circles","curves"],
  },
  "1547565560-7d3313e7fff1": {
    tags: ["cat","animal","home"],
    subjects: ["orange kitten","peeking from bin","checkered fabric","paws"],
    shapes: ["centered","geometric","organic"],
  },
  "1547573854-74d2a71d0826": {
    tags: ["meal","food","dinner","friends","restaurant"],
    subjects: ["roasted meat","salad plates","bread basket"],
    shapes: ["circles","repeating","busy","layered"],
  },
  "1547583881-58685cb3210f": {
    tags: ["coffee","drink","warm","home","cozy"],
    subjects: ["steaming mug","hot drink","shadows"],
    shapes: ["vertical","centered","minimal"],
  },
  "1547714607-f85915cc810a": {
    tags: ["home","cozy","art","cafe"],
    subjects: ["ceramic bowl","bamboo tray","striped cloth"],
    shapes: ["circles","minimal","centered","lines"],
  },
  "1547841243-eacb14453cd9": {
    tags: ["city","travel","water","clouds"],
    subjects: ["One World Trade Center","Manhattan skyline","Hudson River"],
    shapes: ["horizontal","layered","lines"],
  },
  "1547868647-7037fb43568a": {
    tags: ["coffee","drink","warm","cozy","home"],
    subjects: ["steaming mug","pinecones","wood block"],
    shapes: ["vertical","centered","layered"],
  },
  "1547931295-64c05303a15b": {
    tags: ["music","home","art","hobby"],
    subjects: ["grand piano","piano keys","window reflection","polished black"],
    shapes: ["lines","curves","layered"],
  },
  "1547941126-3d5322b218b0": {
    tags: ["running","sports","fitness","outdoors"],
    subjects: ["runner","running shoes","track"],
    shapes: ["lines","diagonal","geometric"],
  },
  "1547970185-cf96be06ed17": {
    tags: ["coffee","drink","warm","outdoors","travel"],
    subjects: ["steaming mug","hand","mountains"],
    shapes: ["centered","vertical","organic"],
  },
  "1548174753-897b449b097e": {
    tags: ["laptop","work","desk","night","coffee"],
    subjects: ["hands","laptop screen","code editor","mug"],
    shapes: ["horizontal","layered","geometric"],
  },
  "1548191194-b3d4f051fd7d": {
    tags: ["reading","cozy","home","warm","people"],
    subjects: ["person reading","open book","bed blankets"],
    shapes: ["vertical","centered","layered"],
  },
  "1548439739-0cf616cef1cd": {
    tags: ["dog","pets","animal","home","cozy","people"],
    subjects: ["golden retriever","human hand","couch","window light","grey sleeve"],
    shapes: ["vertical","centered","organic","framed"],
  },
  "1548658146-f142deadf8f7": {
    tags: ["dog","pets","animal","home"],
    subjects: ["australian shepherd puppy","tri-color fur","white blaze","front paws","dark background"],
    shapes: ["vertical","centered","organic","minimal"],
  },
  "1548658166-136d9f6a7e76": {
    tags: ["dog","pets","animal","home"],
    subjects: ["yawning puppy","brown and white fur","paws","claws","pink tongue"],
    shapes: ["vertical","centered","organic","curves"],
  },
  "1548695151-ac40f371b3f4": {
    tags: ["music","home","cozy","warm","plants"],
    subjects: ["digital piano","keyboard keys","potted plant"],
    shapes: ["diagonal","lines","layered"],
  },
  "1548818251-53e9da6f0655": {
    tags: ["coffee","drink","cooking","home"],
    subjects: ["chemex","electric kettle","coffee grounds","kitchen counter"],
    shapes: ["vertical","organic","layered"],
  },
  "1548858565-461b87144b6a": {
    tags: ["dog","pets","animal","outdoors"],
    subjects: ["australian shepherd puppy","blue merle coat","dry grass","tan markings"],
    shapes: ["vertical","centered","organic","minimal"],
  },
  "1548940740-204726a19be3": {
    tags: ["meal","food","restaurant","bread","dinner"],
    subjects: ["khachapuri bread","meat stew","appetizers"],
    shapes: ["circles","organic","busy","layered"],
  },
  "1549005270-8f4e7b89a7f4": {
    tags: ["outdoors","sunrise","plants"],
    subjects: ["yellow flowers","field","golden hour"],
    shapes: ["horizontal","layered","organic"],
  },
  "1549223565-49541e8416dc": {
    tags: ["music","concert","people","art"],
    subjects: ["drummer","drum kit","spotlight beams"],
    shapes: ["vertical","diagonal","layered"],
  },
  "1549248220-5811dc32cd5d": {
    tags: ["food","meal","dessert","snack"],
    subjects: ["citrus salad","orange slices","pomegranate seeds","mint"],
    shapes: ["circles","layered","organic"],
  },
  "1549291981-56d443d5e2a2": {
    tags: ["dog","pets","animal"],
    subjects: ["chocolate lab puppy","red collar","blue background","profile view"],
    shapes: ["centered","horizontal","minimal","organic"],
  },
  "1549298916-b41d501d3772": {
    tags: ["fashion","photography","cozy","vintage"],
    subjects: ["Nike Air Force 1","Carhartt sneaker","corduroy fabric"],
    shapes: ["diagonal","organic","repeating"],
  },
  "1549298916-f52d724204b4": {
    tags: ["fashion","vintage","cozy","photography"],
    subjects: ["Nike Air Force 1","Carhartt sneakers","corduroy jacket"],
    shapes: ["diagonal","organic","repeating","layered"],
  },
  "1549417229-bc7a29c3ed2e": {
    tags: ["cozy","home","snow","vintage","dinner"],
    subjects: ["wooden dining table","snowy window","pendant lamp","deer figurines"],
    shapes: ["horizontal","layered","framed"],
  },
  "1550026593-dd8ce0749590": {
    tags: ["dancing","people","fitness","art"],
    subjects: ["ballet dancers","black leotards","stage","bokeh lights","stage truss"],
    shapes: ["horizontal","lines","diagonal","layered"],
  },
  "1550026593-f369f98df0af": {
    tags: ["dancing","people","fitness","art"],
    subjects: ["female dancers","silhouettes","stage lights","red backdrop","dance stage"],
    shapes: ["horizontal","organic","repeating","minimal"],
  },
  "1550120337-258f4001493b": {
    tags: ["outdoors","rain","hiking","people"],
    subjects: ["rain boots","forest floor","moss"],
    shapes: ["organic","centered","busy"],
  },
  "1550249825-672da2a75487": {
    tags: ["coffee","drink","cozy","warm","cafe"],
    subjects: ["chemex","gooseneck kettle","paper filter","coffee grounds"],
    shapes: ["vertical","curves","layered"],
  },
  "1550399105-c4db5fb85c18": {
    tags: ["reading","vintage","art","home"],
    subjects: ["vintage book spines","antique books","library stack"],
    shapes: ["vertical","repeating","busy"],
  },
  "1550399865-ec7d23b18e8e": {
    tags: ["fashion","sports","photography"],
    subjects: ["Nike Air Max 95","sneaker","white background"],
    shapes: ["diagonal","curves","minimal","centered"],
  },
  "1550559256-32644b7a2993": {
    tags: ["coffee","drink","warm"],
    subjects: ["coffee bloom","paper filter","bubbles","glass carafe"],
    shapes: ["circles","organic","centered"],
  },
  "1550592704-6c76defa9985": {
    tags: ["study","work","desk","cozy"],
    subjects: ["hand","red pen","notebook","sweater"],
    shapes: ["diagonal","minimal","vertical"],
  },
  "1550592704-a8e20db60e57": {
    tags: ["tea","cozy","people","home"],
    subjects: ["pink mug","hands","cardigan","typography"],
    shapes: ["centered","vertical","minimal"],
  },
  "1550731358-491ded4af838": {
    tags: ["coffee","drink","warm","people"],
    subjects: ["latte art","coffee cup","hand"],
    shapes: ["centered","curves"],
  },
  "1550763347-0736ab2976ea": {
    tags: ["city","travel","trees","park"],
    subjects: ["Chicago skyline","skyscrapers","green trees"],
    shapes: ["horizontal","layered","lines"],
  },
  "1551107696-a4b0c5a0d9a2": {
    tags: ["fashion","cozy","photography"],
    subjects: ["New Balance X90","sherpa fabric","sneaker"],
    shapes: ["diagonal","curves","centered","minimal"],
  },
  "1551266681-ba5f0b95e2e5": {
    tags: ["coffee","drink","cafe"],
    subjects: ["latte art","coffee cup","barista"],
    shapes: ["centered","curves"],
  },
  "1551408687-4fa2bd0b683a": {
    tags: ["dog","pets","animal","outdoors","plants"],
    subjects: ["mixed breed puppy","pine needles","diamond fence","black muzzle","snow specks"],
    shapes: ["vertical","centered","organic","framed"],
  },
  "1551524163-d00af9f12253": {
    tags: ["sunset","water","home","nature"],
    subjects: ["window","ocean sunset","silhouette"],
    shapes: ["vertical","framed","layered"],
  },
  "1551546785-423f456af418": {
    tags: ["art","home","vintage","cozy"],
    subjects: ["ceramic bowl","linen cloth","still life"],
    shapes: ["circles","minimal","centered"],
  },
  "1551727609-1f89c019b5ca": {
    tags: ["coffee","drink","cafe","warm"],
    subjects: ["espresso cup","sugar shaker","marble table"],
    shapes: ["circles","centered","minimal"],
  },
  "1551807306-4bcd16b92a41": {
    tags: ["home","vintage","art","cozy"],
    subjects: ["ceramic plates","bowls","saucers"],
    shapes: ["circles","repeating","minimal","layered"],
  },
  "1551887373-3c5bd224f6e2": {
    tags: ["dog","pets","animal","outdoors","smile"],
    subjects: ["golden retriever","asphalt pavement","belly up pose","front paws"],
    shapes: ["centered","organic","circles","minimal"],
  },
  "1552053831-71594a27632d": {
    tags: ["dog","pets","animal","flowers"],
    subjects: ["puppy","tulip","golden retriever"],
    shapes: ["centered","organic"],
  },
  "1552181903-a6af3a3d159d": {
    tags: ["people","friends","restaurant","lunch","city"],
    subjects: ["woman","outdoor table","water glasses","smartphone"],
    shapes: ["horizontal","busy","organic"],
  },
  "1552196527-bffef41ef674": {
    tags: ["yoga","fitness"],
    subjects: ["backbend","woman","yoga"],
    shapes: ["curves","vertical","centered"],
  },
  "1552196563-55cd4e45efb3": {
    tags: ["yoga","fitness","study"],
    subjects: ["seated twist","yoga mat","woman"],
    shapes: ["centered","horizontal"],
  },
  "1552206735-e18f41fe76de": {
    tags: ["yoga","wellness","flowers","cozy"],
    subjects: ["eye pillow","lavender sprig","woman resting"],
    shapes: ["vertical","centered","minimal"],
  },
  "1552257524-66af6dc9e77c": {
    tags: ["dog","people","smile","outdoors","family"],
    subjects: ["woman","dachshund puppy","grass","sitting"],
    shapes: ["vertical","centered","organic"],
  },
  "1552260050-be0b9cc94369": {
    tags: ["dancing","people","art","photography"],
    subjects: ["woman","white dress","motion blur","light trails","dark background"],
    shapes: ["curves","organic","centered","minimal"],
  },
  "1552325476-5df397d5b547": {
    tags: ["home","sunset","city","window","travel"],
    subjects: ["window view","red brick buildings","canal bridge"],
    shapes: ["vertical","framed","layered"],
  },
  "1552346154-21d32810aba3": {
    tags: ["sports","fashion","outdoors"],
    subjects: ["Air Jordan 1","basketball court","sneakers"],
    shapes: ["diagonal","lines","geometric"],
  },
  "1552422530-9b41dc72286b": {
    tags: ["music","hobby","people","home"],
    subjects: ["hands","piano keys","upright piano","playing"],
    shapes: ["lines","horizontal","diagonal"],
  },
  "1552484586-1a51df66315c": {
    tags: ["clouds","outdoors","photography"],
    subjects: ["cumulus cloud","dark blue sky"],
    shapes: ["organic","curves","diagonal","minimal"],
  },
  "1552657513-7691ecceca7c": {
    tags: ["hiking","outdoors","water","travel"],
    subjects: ["hiking boots","grass path","stream"],
    shapes: ["vertical","organic","layered"],
  },
  "1552833755-fdb50eeb8cf1": {
    tags: ["coffee","drink","warm","cafe","cooking"],
    subjects: ["espresso machine","portafilter","coffee stream","ceramic cup"],
    shapes: ["vertical","lines","horizontal"],
  },
  "1552912470-ee2e96439539": {
    tags: ["food","meal","city","people","night"],
    subjects: ["street food vendor","fish balls","curry skewers","night market"],
    shapes: ["busy","repeating","layered"],
  },
  "1553292218-4892c2e7e1ae": {
    tags: ["coffee","cooking","cafe"],
    subjects: ["coffee beans","ground coffee","portafilter"],
    shapes: ["vertical","centered","geometric"],
  },
  "1553385363-6d4790dbd976": {
    tags: ["fashion","vintage","outdoors","home"],
    subjects: ["cowboy boots","wooden deck","brick wall"],
    shapes: ["vertical","lines","organic"],
  },
  "1553406624-739b610cf5c8": {
    tags: ["music","concert","people","art"],
    subjects: ["snare drum","drum kit","blue stage lights"],
    shapes: ["circles","centered","vertical"],
  },
  "1553528565-4e35ea71b0d8": {
    tags: ["dancing","people","art","photography"],
    subjects: ["woman","motion blur","neon lights","blue light","red light"],
    shapes: ["vertical","curves","organic","layered"],
  },
  "1553578615-ee00f2db2c5c": {
    tags: ["coffee","drink","warm"],
    subjects: ["cappuccino","foam","coffee cup"],
    shapes: ["circles","centered","minimal"],
  },
  "1553736026-ff14d158d222": {
    tags: ["dog","pets","animal","home","cozy"],
    subjects: ["golden retriever puppy","white bedding","wooden headboard","floating shelf","pillows"],
    shapes: ["vertical","centered","layered","organic"],
  },
  "1553742198-6eea5ac42a24": {
    tags: ["coffee","drink","warm","cafe"],
    subjects: ["espresso","white cup","crema","saucer"],
    shapes: ["circles","centered","minimal"],
  },
  "1553787499-4036afbbcd8d": {
    tags: ["coffee","drink","warm","cafe"],
    subjects: ["espresso machine","glass cup","milk pitcher","crema"],
    shapes: ["vertical","layered","circles"],
  },
  "1553867669-5ef9529cc9a2": {
    tags: ["coffee","drink","cafe","warm"],
    subjects: ["espresso machine","portafilter","coffee stream","espresso cup"],
    shapes: ["vertical","lines","circles"],
  },
  "1554133724-a22ead39af6b": {
    tags: ["outdoors","fashion","park","home"],
    subjects: ["work boots","stone walkway","grass"],
    shapes: ["diagonal","lines","centered"],
  },
  "1554133818-7bb790d55236": {
    tags: ["outdoors","fashion","park","garden"],
    subjects: ["work boots","grass","Timberland boots"],
    shapes: ["organic","diagonal","minimal"],
  },
  "1554245064-3ab88761ac5d": {
    tags: ["yoga","fitness","home","people"],
    subjects: ["yoga pose","dancer pose","minimalist room"],
    shapes: ["centered","vertical","minimal"],
  },
  "1554412663-7b99cf315535": {
    tags: ["laptop","work","desk"],
    subjects: ["hands","laptop","tablet","keyboard"],
    shapes: ["horizontal","layered","geometric"],
  },
  "1554412664-6a4d8f640b3b": {
    tags: ["laptop","work","desk"],
    subjects: ["hands","laptop","tablet","smartphone"],
    shapes: ["horizontal","geometric","layered"],
  },
  "1554446422-c4d46271ab85": {
    tags: ["music","home","art","hobby"],
    subjects: ["digital piano","piano keys","music stand","white keyboard"],
    shapes: ["diagonal","lines","minimal","geometric"],
  },
  "1554456854-55a089fd4cb2": {
    tags: ["dog","pets","animal","outdoors","flowers","smile"],
    subjects: ["golden retriever","white daisies","grass field","black harness","tongue"],
    shapes: ["horizontal","centered","organic","circles"],
  },
  "1554569409-f5ac433e0f67": {
    tags: ["kids","play","outdoors","rain"],
    subjects: ["rain boots","child legs","brick path"],
    shapes: ["vertical","repeating","centered"],
  },
  "1554579306-94e345617dbc": {
    tags: ["sports","outdoors","city","fitness"],
    subjects: ["stadium","soccer field","running track"],
    shapes: ["curves","lines","horizontal","layered"],
  },
  "1554600740-951beab4712b": {
    tags: ["coffee","drink","warm"],
    subjects: ["black coffee","mug","crema ring"],
    shapes: ["circles","centered"],
  },
  "1554672407-5bb97ff940cc": {
    tags: ["people","work","friends"],
    subjects: ["handshake","t-shirt","greeting"],
    shapes: ["centered","horizontal","minimal"],
  },
  "1554692936-82776f9406db": {
    tags: ["dog","pets","animal","outdoors","park"],
    subjects: ["pembroke corgi","paved path","park foliage","fluffy fur","tongue"],
    shapes: ["vertical","centered","organic","curves"],
  },
  "1555447014-7ead71574544": {
    tags: ["tea","drink","warm","home","cozy"],
    subjects: ["pink mug","tea bag","yellow tag"],
    shapes: ["centered","minimal","vertical"],
  },
  "1555489401-79c274997434": {
    tags: ["dancing","people","celebration","art"],
    subjects: ["ballroom dancers","woman","man","red dress","purple backdrop"],
    shapes: ["vertical","curves","diagonal","centered"],
  },
  "1555606396-79625d075363": {
    tags: ["cat","animal","people","home"],
    subjects: ["kitten","hands holding cat","houseplant","gift tag"],
    shapes: ["vertical","centered","organic"],
  },
  "1555685812-4b943f1cb0eb": {
    tags: ["cat","animal","home","cozy"],
    subjects: ["kitten","Scottish Fold","sofa","cushion"],
    shapes: ["centered","curves","organic"],
  },
  "1555704232-77904cb981fe": {
    tags: ["flowers","music","romantic","art"],
    subjects: ["red rose","piano keys","flower petals"],
    shapes: ["curves","horizontal","centered"],
  },
  "1555949258-eb67b1ef0ceb": {
    tags: ["food","meal","dinner","lunch"],
    subjects: ["penne pasta","cream sauce","bell peppers","mint garnish"],
    shapes: ["geometric","centered","minimal"],
  },
  "1555965708-54e82207ba97": {
    tags: ["food","drink","meal","restaurant","friends"],
    subjects: ["nachos","guacamole","mojito","tortilla chips"],
    shapes: ["geometric","circles","layered"],
  },
  "1556029096-6696c16e115d": {
    tags: ["food","meal","dinner","restaurant"],
    subjects: ["linguine","bolognese sauce","parmesan shavings","white bowl"],
    shapes: ["circles","centered","curves"],
  },
  "1556386470-bcdc6a5e9b9e": {
    tags: ["food","meal","cooking","lunch"],
    subjects: ["vegetable salad","avocado slices","carrots","wooden table"],
    shapes: ["circles","centered","busy","organic"],
  },
  "1556386734-4227a180d19e": {
    tags: ["food","meal","lunch","cooking"],
    subjects: ["vegetable salad","white bowl","wooden table","broccoli"],
    shapes: ["circles","centered","busy","organic"],
  },
  "1556403806-90f55c9db1e1": {
    tags: ["food","snack","meal","lunch"],
    subjects: ["nachos","salsa","jalapeños","lime wedges"],
    shapes: ["horizontal","layered","busy"],
  },
  "1556484687-30636164638b": {
    tags: ["people","friends","family","work"],
    subjects: ["diverse hands","wooden table","smartwatch"],
    shapes: ["horizontal","repeating","centered"],
  },
  "1556566952-11eff3d06ed4": {
    tags: ["reading","vintage","flowers","cozy"],
    subjects: ["vintage books","carnation flower","twine bundle"],
    shapes: ["vertical","centered","organic"],
  },
  "1556647034-7aa9a4ea7437": {
    tags: ["dog","pets","animal","cafe","smile"],
    subjects: ["golden retriever","cafe chairs","indoor floor","tongue","black chairs"],
    shapes: ["centered","vertical","organic","geometric"],
  },
  "1556746223-5aa9f4ce76df": {
    tags: ["family","people","kids"],
    subjects: ["child hand","adult hands","stacked palms"],
    shapes: ["layered","centered","organic"],
  },
  "1556816723-1ce827b9cfbb": {
    tags: ["yoga","fitness","sunset","mountains"],
    subjects: ["yoga silhouette","King Dancer pose","mountain ridge"],
    shapes: ["horizontal","centered","minimal"],
  },
  "1556906781-9a412961c28c": {
    tags: ["fashion","city","people","outdoors"],
    subjects: ["Air Jordan sneakers","legs","city buildings"],
    shapes: ["vertical","lines","repeating"],
  },
  "1556908153-1055164fe2df": {
    tags: ["cooking","home","people","meal","bread"],
    subjects: ["man","steaming pot","sourdough loaf","parsley"],
    shapes: ["vertical","layered","organic"],
  },
  "1556908247-45afb446ed86": {
    tags: ["cooking","home","people","meal"],
    subjects: ["woman","dry spaghetti","steaming Dutch oven","gas stove"],
    shapes: ["vertical","lines","centered"],
  },
  "1556908289-84da46520347": {
    tags: ["cooking","home","people","breakfast","meal"],
    subjects: ["woman","cracking egg","frying pan","gas stove"],
    shapes: ["vertical","layered","busy"],
  },
  "1556909114-f6e7ad7d3136": {
    tags: ["cooking","home","people","family","meal"],
    subjects: ["couple","adding onions","red Dutch oven","bell peppers"],
    shapes: ["vertical","centered","layered"],
  },
  "1556909172-bd5315ff61a0": {
    tags: ["cooking","home","people","family","meal"],
    subjects: ["couple","red Dutch oven","open oven","vegetables"],
    shapes: ["vertical","centered","layered"],
  },
  "1556911073-38141963c9e0": {
    tags: ["cooking","home","people","family","meal"],
    subjects: ["couple","seasoning food","marble island","lemons"],
    shapes: ["vertical","layered","busy"],
  },
  "1556911073-a517e752729c": {
    tags: ["cooking","home","people","meal"],
    subjects: ["woman","adding greens","stainless steel pot","passion fruit"],
    shapes: ["vertical","layered","busy"],
  },
  "1556911220-dabc1f02913a": {
    tags: ["cooking","home","people","meal"],
    subjects: ["man","chopping zucchini","cutting board","chef knife"],
    shapes: ["vertical","lines","layered"],
  },
  "1556911220-e15b29be8c8f": {
    tags: ["cooking","home","people","meal"],
    subjects: ["woman","stirring pot","orange Dutch oven","lemons"],
    shapes: ["vertical","layered","busy"],
  },
  "1556912999-8cd7c2582a5e": {
    tags: ["cooking","home","people","plants","meal"],
    subjects: ["woman","basil plant","windowsill herbs","stir-fry pan"],
    shapes: ["vertical","organic","layered"],
  },
  "1557211300-9991249b466a": {
    tags: ["city","travel","night","clouds"],
    subjects: ["Empire State Building","Manhattan dusk","city lights"],
    shapes: ["horizontal","layered","lines"],
  },
  "1557236751-b60abca1479e": {
    tags: ["family","people","kids"],
    subjects: ["stacked hands","adult hand","child hand"],
    shapes: ["vertical","layered","centered"],
  },
  "1557461761-c7c2b7a5fa97": {
    tags: ["fashion","night","city","photography"],
    subjects: ["Nike Roshe sneaker","neon lights","wet pavement"],
    shapes: ["horizontal","circles","centered","minimal"],
  },
  "1557495235-340eb888a9fb": {
    tags: ["dog","pets","animal","people","friends","outdoors","smile"],
    subjects: ["woman","chocolate labrador","green leash","grass field","sunglasses"],
    shapes: ["horizontal","organic","curves","centered"],
  },
  "1557966540-e2f93bfbd93d": {
    tags: ["friends","celebration","outdoors","people"],
    subjects: ["legs","boots","jumping friends"],
    shapes: ["horizontal","repeating","organic"],
  },
  "1558004282-e2b2587e3e47": {
    tags: ["fashion","sports","city","outdoors"],
    subjects: ["Nike Air Presto","foot","metal bleachers"],
    shapes: ["diagonal","lines","repeating","geometric"],
  },
  "1558098329-a11cff621064": {
    tags: ["music","hobby","home","art"],
    subjects: ["acoustic guitar","12-string guitar","living room","armchair"],
    shapes: ["vertical","centered","lines"],
  },
  "1558121591-b684092bb548": {
    tags: ["dog","pets","animal","home"],
    subjects: ["border collie","amber eyes","black and white fur","couch cushion"],
    shapes: ["vertical","centered","organic","minimal"],
  },
  "1558220829-4694a46bb01f": {
    tags: ["coffee","drink","cafe","warm"],
    subjects: ["latte art","coffee cup","cafe"],
    shapes: ["centered","curves"],
  },
  "1558236714-d1a6333fce68": {
    tags: ["dog","pets","animal","outdoors","plants","garden"],
    subjects: ["pomeranian","hosta leaves","garden foliage","peeking dog","fluffy fur"],
    shapes: ["centered","organic","framed","curves"],
  },
  "1558385952-504347abdceb": {
    tags: ["dog","pets","animal","people","outdoors","park","trees"],
    subjects: ["goldendoodles","park tree","grass slope","dog walker","leashes"],
    shapes: ["vertical","organic","layered","lines"],
  },
  "1558416165-5fb04b79b0e7": {
    tags: ["coffee","drink","cafe","warm"],
    subjects: ["espresso machine","shot glasses","crema"],
    shapes: ["vertical","centered","geometric"],
  },
  "1558436225-305740e8199c": {
    tags: ["dancing","fitness","city","outdoors"],
    subjects: ["ballerina","pointe shoes","blue dress","city plaza","paved tiles"],
    shapes: ["vertical","curves","diagonal","organic"],
  },
  "1558469847-f62352e72555": {
    tags: ["home","city","window","travel","vintage"],
    subjects: ["window frame","colorful buildings","open shutters"],
    shapes: ["vertical","framed","layered"],
  },
  "1558709501-0f4e9ab3d29c": {
    tags: ["hiking","outdoors","travel","fitness"],
    subjects: ["hiking boot","forest floor","moss"],
    shapes: ["vertical","organic","layered"],
  },
  "1558788353-f76d92427f16": {
    tags: ["dog","pets","animal","smile"],
    subjects: ["golden retriever","blue backdrop","tongue","studio portrait","golden fur"],
    shapes: ["vertical","centered","organic","minimal"],
  },
  "1559001724-fbad036dbc9e": {
    tags: ["coffee","drink","cafe","warm"],
    subjects: ["latte art","coffee cup","wooden table"],
    shapes: ["circles","centered"],
  },
  "1559157306-406ce1382742": {
    tags: ["dancing","fitness","art","photography"],
    subjects: ["ballerina","tutu","pointe shoes","motion blur","black background"],
    shapes: ["curves","organic","diagonal","minimal"],
  },
  "1559250507-ca1830134117": {
    tags: ["home","cozy","night","warm"],
    subjects: ["bedroom window","blinds","bed"],
    shapes: ["horizontal","layered","framed"],
  },
  "1559304754-a042e039e5dd": {
    tags: ["music","hobby","vintage","art"],
    subjects: ["acoustic guitar","barn door","wooden planks","rustic"],
    shapes: ["vertical","lines","centered"],
  },
  "1559317996-d154e05c76fb": {
    tags: ["food","meal","lunch","snack"],
    subjects: ["garden salad","lettuce","corn kernels","bell peppers"],
    shapes: ["organic","busy","layered"],
  },
  "1559496417-e7f25cb247f3": {
    tags: ["coffee","drink","warm","cafe"],
    subjects: ["cortado","coffee glass","crema"],
    shapes: ["circles","centered","minimal"],
  },
  "1559506026-181ed433f0b0": {
    tags: ["hiking","outdoors","fitness","people"],
    subjects: ["hiking boot sole","grass field","Vibram tread"],
    shapes: ["geometric","organic","centered"],
  },
  "1559865662-53df87d25df6": {
    tags: ["music","concert","people","art"],
    subjects: ["young drummer","drum kit","stage backlight"],
    shapes: ["vertical","centered","circles"],
  },
  "1559925393-8be0ec4767c8": {
    tags: ["cafe","city","travel","coffee","outdoors"],
    subjects: ["outdoor cafe","chalkboard menu","cobblestone street","bistro tables"],
    shapes: ["vertical","repeating","busy"],
  },
  "1559932199-d6da2ce8fa4e": {
    tags: ["cat","animal","outdoors"],
    subjects: ["tabby cat","green eyes","portrait","whiskers"],
    shapes: ["vertical","centered","organic"],
  },
  "1560088161-ca82e528afc9": {
    tags: ["dancing","people","fitness","art"],
    subjects: ["dance ensemble","dancers","stage","flowing costumes","bare feet"],
    shapes: ["horizontal","organic","lines","layered"],
  },
  "1560233026-ad254fa8da38": {
    tags: ["yoga","fitness","sunset","outdoors"],
    subjects: ["yoga silhouette","standing balance pose","rocky hill"],
    shapes: ["vertical","centered","minimal"],
  },
  "1560233075-4c1e2007908e": {
    tags: ["yoga","fitness","outdoors","people"],
    subjects: ["yoga pose","desert rocks","red activewear"],
    shapes: ["vertical","centered","organic"],
  },
  "1560354291-c2b9d7e44181": {
    tags: ["coffee","drink","cafe","warm","cooking"],
    subjects: ["pour-over dripper","paper filter","gooseneck kettle","coffee grounds"],
    shapes: ["vertical","organic","centered"],
  },
  "1560448205-d82bf18b9bcf": {
    tags: ["home","water","balcony","plants","clouds"],
    subjects: ["balcony terrace","wicker chairs","lake view"],
    shapes: ["horizontal","layered","framed"],
  },
  "1560717844-57e41a5e4758": {
    tags: ["food","snack","meal","restaurant"],
    subjects: ["grilled corn","elote","pomegranate seeds","cotija cheese"],
    shapes: ["diagonal","layered","organic"],
  },
  "1560743641-3914f2c45636": {
    tags: ["dog","pets","animal","outdoors","play","fitness"],
    subjects: ["pembroke corgi","terrier mix","brick path","tall grass","running dogs"],
    shapes: ["vertical","diagonal","organic","lines"],
  },
  "1560769629-975ec94e6a86": {
    tags: ["fashion","sports","photography"],
    subjects: ["chunky sneakers","white cube","studio display"],
    shapes: ["diagonal","geometric","minimal","centered"],
  },
  "1560788784-66eda82b5eb7": {
    tags: ["food","meal","dinner","cooking","warm"],
    subjects: ["pesto pasta","grilled chicken","steaming fork","fettuccine"],
    shapes: ["vertical","curves","layered"],
  },
  "1560807707-8cc77767d783": {
    tags: ["dog","pets","animal","cozy"],
    subjects: ["cavalier spaniel","puppy","blanket"],
    shapes: ["centered","curves"],
  },
  "1560880928-efaf56e9bed8": {
    tags: ["rain","outdoors","flowers","fashion"],
    subjects: ["floral rain boots","wet ground","clover"],
    shapes: ["organic","centered","curves"],
  },
  "1560928863-e140ee0fc733": {
    tags: ["clouds","outdoors","rain","photography"],
    subjects: ["storm clouds","overcast sky"],
    shapes: ["organic","layered","busy"],
  },
  "1561014816-50ce5acb5e73": {
    tags: ["music","art","hobby","photography"],
    subjects: ["piano keys","keyboard","black and white","close-up"],
    shapes: ["lines","repeating","diagonal","geometric"],
  },
  "1561049501-e1f96bdd98fd": {
    tags: ["yoga","fitness","sunset","outdoors"],
    subjects: ["yoga silhouette","Warrior III pose","sunset sky"],
    shapes: ["vertical","centered","minimal"],
  },
  "1561050933-ff182cf52c2f": {
    tags: ["drink","cafe","night","people"],
    subjects: ["hands","plastic cup","straw","neon sign"],
    shapes: ["centered","curves","organic"],
  },
  "1561438774-1790fe271b8f": {
    tags: ["dog","pets","animal","outdoors","flowers","play"],
    subjects: ["white fluffy dog","clover flowers","grass field","airplane contrails","trees"],
    shapes: ["centered","organic","circles","horizontal"],
  },
  "1561488111-5d800fd56b8a": {
    tags: ["city","travel","sunset","water"],
    subjects: ["Sydney skyline","Sydney Tower Eye","harbor reflection"],
    shapes: ["horizontal","layered","lines"],
  },
  "1561650983-da1423904f5f": {
    tags: ["dog","pets","animal","outdoors","plants"],
    subjects: ["brown white puppy","dirt path","green foliage","pink tongue","sitting pose"],
    shapes: ["vertical","centered","organic","minimal"],
  },
  "1561812938-f6e60cbf95e3": {
    tags: ["vintage","art","reading","study"],
    subjects: ["antique manuscript","cursive script","aged paper","stain"],
    shapes: ["horizontal","lines","organic"],
  },
  "1562088287-bde35a1ea917": {
    tags: ["yoga","outdoors","fitness","plants"],
    subjects: ["eagle arms","yoga mat","wooden deck"],
    shapes: ["centered","organic"],
  },
  "1562165742-5fb25d795480": {
    tags: ["dog","pets","animal","home","cozy"],
    subjects: ["chow chow puppy","sherpa blanket","fluffy fur","cream coat"],
    shapes: ["centered","organic","curves","minimal"],
  },
  "1562183241-840b8af0721e": {
    tags: ["fashion","sports","city","outdoors"],
    subjects: ["Adidas Deerupt sneakers","metal grate","stairs"],
    shapes: ["repeating","geometric","lines","layered"],
  },
  "1562183241-b937e95585b6": {
    tags: ["sports","fashion","people","outdoors"],
    subjects: ["Adidas Deerupt sneakers","hand","bridge walkway"],
    shapes: ["vertical","repeating","geometric","diagonal"],
  },
  "1562388364-cfca9bff0b41": {
    tags: ["people","art","friends"],
    subjects: ["gripping hand","wrist tattoo","torn paper hole"],
    shapes: ["organic","vertical","centered"],
  },
  "1562593028-1fe2d15bde36": {
    tags: ["hiking","outdoors","mountains","travel"],
    subjects: ["hiker with backpack","forest trail","mountain peaks"],
    shapes: ["vertical","layered","lines"],
  },
  "1562751362-404243c2eea3": {
    tags: ["yoga","fitness","water","sunrise"],
    subjects: ["woman stretching","rocky shore","lake view"],
    shapes: ["vertical","centered","organic"],
  },
  "1563219125-60d10ffe8877": {
    tags: ["city","travel","clouds","outdoors"],
    subjects: ["Dallas skyline","highway","skyscrapers"],
    shapes: ["horizontal","layered","lines"],
  },
  "1563311977-d285756282dc": {
    tags: ["coffee","drink","cafe","warm"],
    subjects: ["latte art","milk pitcher","barista"],
    shapes: ["circles","centered","curves"],
  },
  "1563317596-9f46b0d0d5cf": {
    tags: ["outdoors","landscape","badlands","clouds","travel"],
    subjects: ["badlands hills","evergreen trees","winding river"],
    shapes: ["horizontal","layered","organic"],
  },
  "1563718944-758794a56b34": {
    tags: ["city","travel","water","clouds"],
    subjects: ["Chicago skyline","John Hancock Center","Lake Michigan"],
    shapes: ["vertical","layered","horizontal"],
  },
  "1592194996308-7b43878e84a6": {
    tags: ["cat","pets","animal","play"],
    subjects: ["kitten","tabby cat","reaching paw"],
    shapes: ["centered","vertical"],
  },
  "1721327900411-b315dce4388e": {
    tags: ["pets","animal"],
    subjects: ["hamster","pet","cage"],
    shapes: ["centered","organic"],
  },
  "1738486310307-d2982bd995e6": {
    tags: ["pets","animal"],
    subjects: ["hamster","pet","rodent"],
    shapes: ["centered","organic"],
  },
  "1762342672674-bc14e52572f4": {
    tags: ["fashion","crafts","home"],
    subjects: ["hands","heart rings","lace fabric"],
    shapes: ["layered","repeating","centered"],
  },
};

// ── Launch-expansion themes: per-theme labels applied to every discovered
//    id (from new-theme-ids.json). Keeps the 126 new ids hand-labelled
//    without 126 literal blocks. Merged into OVERRIDES below. ──
const NEW_THEME_META = {
  butterfly: { tags: ["wildlife", "animal", "outdoors", "flowers", "garden"], subjects: ["butterfly", "wings", "flower", "wildlife"], shapes: ["centered", "organic", "curves", "minimal"] },
  moth: { tags: ["wildlife", "animal", "outdoors", "night"], subjects: ["moth", "wings", "insect", "macro"], shapes: ["centered", "organic", "symmetry", "minimal"] },
  art: { tags: ["art", "crafts", "hobby", "museum"], subjects: ["painting", "canvas", "art studio", "brushes"], shapes: ["layered", "busy", "organic", "centered"] },
  baking: { tags: ["baking", "cooking", "bread", "dessert", "food"], subjects: ["baking", "dough", "bread", "oven"], shapes: ["circles", "layered", "organic", "centered"] },
  garden: { tags: ["garden", "plants", "flowers", "outdoors"], subjects: ["garden", "plants", "soil", "gardening"], shapes: ["organic", "layered", "vertical", "centered"] },
  fishing: { tags: ["outdoors", "water", "lake", "sports"], subjects: ["fishing rod", "river", "fisherman", "lake"], shapes: ["horizontal", "organic", "minimal", "centered"] },
  hiking: { tags: ["hiking", "outdoors", "mountains", "trees", "fitness"], subjects: ["hiking trail", "backpack", "mountains", "forest"], shapes: ["vertical", "layered", "organic", "lines"] },
  yoga: { tags: ["yoga", "fitness", "home", "outdoors"], subjects: ["yoga pose", "yoga mat", "stretch", "balance"], shapes: ["centered", "curves", "vertical", "minimal"] },
  gym: { tags: ["fitness", "sports", "people"], subjects: ["dumbbells", "weights", "workout", "gym"], shapes: ["geometric", "centered", "lines", "vertical"] },
  camping: { tags: ["outdoors", "travel", "trees", "mountains", "night"], subjects: ["tent", "campfire", "campsite", "forest"], shapes: ["centered", "organic", "layered", "vertical"] },
  travel: { tags: ["travel", "city", "outdoors", "people"], subjects: ["suitcase", "passport", "map", "airport"], shapes: ["centered", "layered", "horizontal", "geometric"] },
  beach: { tags: ["beach", "water", "outdoors", "travel", "sunset"], subjects: ["beach", "sand", "waves", "ocean"], shapes: ["horizontal", "layered", "organic", "minimal"] },
  swimming: { tags: ["water", "sports", "fitness", "outdoors", "travel"], subjects: ["swimming pool", "swimmer", "water", "underwater"], shapes: ["horizontal", "curves", "organic", "minimal"] },
  concert: { tags: ["concert", "music", "party", "people", "city"], subjects: ["concert crowd", "stage lights", "band", "audience"], shapes: ["busy", "vertical", "layered", "lines"] },
  festival: { tags: ["concert", "music", "party", "people", "celebration"], subjects: ["festival crowd", "stage", "lights", "celebration"], shapes: ["busy", "layered", "vertical", "organic"] },
  wedding: { tags: ["wedding", "celebration", "people", "family", "friends"], subjects: ["wedding", "rings", "bride", "bouquet"], shapes: ["centered", "curves", "layered", "minimal"] },
  baby: { tags: ["kids", "family", "people", "smile"], subjects: ["baby", "newborn", "tiny hands", "infant"], shapes: ["centered", "curves", "organic", "minimal"] },
  graduation: { tags: ["celebration", "people", "friends", "study"], subjects: ["graduation cap", "gown", "diploma", "ceremony"], shapes: ["centered", "vertical", "layered", "minimal"] },
  birthday: { tags: ["birthday", "celebration", "party", "people", "dessert"], subjects: ["birthday cake", "candles", "balloons", "party"], shapes: ["circles", "centered", "busy", "layered"] },
  newhome: { tags: ["home", "city", "people", "cozy"], subjects: ["house keys", "moving boxes", "new home", "interior"], shapes: ["centered", "geometric", "minimal", "layered"] },
  cooking: { tags: ["cooking", "food", "home", "meal", "people"], subjects: ["cooking", "kitchen", "pan", "preparing food"], shapes: ["vertical", "layered", "busy", "centered"] },
};

{
  const newIdsPath = path.join(__dirname, "new-theme-ids.json");
  if (fs.existsSync(newIdsPath)) {
    const byTheme = JSON.parse(fs.readFileSync(newIdsPath, "utf8"));
    for (const [theme, ids] of Object.entries(byTheme)) {
      const meta = NEW_THEME_META[theme];
      if (!meta) continue;
      for (const id of ids) {
        if (!OVERRIDES[id]) OVERRIDES[id] = meta;
      }
    }
  }
}

function filterTags(tags) {
  return [...new Set(tags.filter((t) => ALLOWED_TAGS.has(t)))].slice(0, 6);
}

function filterShapes(shapes) {
  return [...new Set(shapes.filter((s) => SHAPE_TAGS.has(s)))].slice(0, 4);
}

function inferSubjects(tags, theme) {
  const out = [];
  const push = (s) => {
    const t = s.trim().toLowerCase();
    if (t && !out.includes(t)) out.push(t);
  };
  for (const tag of tags) {
    for (const s of TAG_SUBJECT_HINTS[tag] ?? [tag]) push(s);
  }
  return out.slice(0, 6);
}

function parseSamplePhotos() {
  const sampleTs = fs.readFileSync(
    path.resolve(__dirname, "../../same-same/data/samplePhotos.ts"),
    "utf8",
  );
  /** @type {Record<string, { tags: string[], shapes: string[], subjects: string[] }>} */
  const byId = {};
  const blockRe =
    /uri:\s*(?:unsplashPhotoUrl\("([^"]+)"\)|"https:\/\/images\.unsplash\.com\/photo-([^?"]+)[^"]*")([\s\S]*?)(?=\n  \},|\n  \{|\n];)/g;
  let block;
  while ((block = blockRe.exec(sampleTs))) {
    const id = block[1] || block[2];
    const body = block[3];
    const tags = body.match(/tags:\s*\[([^\]]+)\]/)?.[1];
    const shapes = body.match(/shapes:\s*\[([^\]]+)\]/)?.[1];
    const subjects = body.match(/subjects:\s*\[([^\]]+)\]/)?.[1];
    const parseArr = (s) =>
      s
        ? s
            .split(",")
            .map((x) => x.replace(/["'\s]/g, ""))
            .filter(Boolean)
        : [];
    byId[id] = {
      tags: filterTags(parseArr(tags)),
      shapes: filterShapes(parseArr(shapes)),
      subjects: parseArr(subjects).filter(
        (s) => !s.includes("moment") && s.length <= 32,
      ),
    };
  }
  return byId;
}

const manifest = buildStockPoolManifest();
const allIds = [...new Set(manifest.map((r) => r.unsplashId))].sort();
const sampleById = parseSamplePhotos();

const curated = {};
for (const id of allIds) {
  if (OVERRIDES[id]) {
    curated[id] = {
      tags: filterTags(OVERRIDES[id].tags),
      subjects: OVERRIDES[id].subjects.slice(0, 6),
      shapes: filterShapes(OVERRIDES[id].shapes ?? []),
    };
    continue;
  }
  const sample = sampleById[id];
  const row = manifest.find((r) => r.unsplashId === id);
  const tags = filterTags(sample?.tags?.length ? sample.tags : row?.tags ?? []);
  const shapes = filterShapes(
    sample?.shapes?.length ? sample.shapes : row?.shapes ?? [],
  );
  let subjects = sample?.subjects?.length ? sample.subjects : [];
  if (!subjects.length) subjects = inferSubjects(tags, row?.theme);
  curated[id] = { tags, subjects: subjects.slice(0, 6), shapes };
}

if (Object.keys(curated).length !== allIds.length) {
  const missing = allIds.filter((id) => !curated[id]);
  console.error("Missing curation for:", missing);
  process.exit(1);
}

const lines = [
  `/**`,
  ` * Hand-curated labels for stock Unsplash images (no OpenAI).`,
  ` * Keyed by Unsplash photo id — applied in buildStockPoolManifest().`,
  ` * Generated by scripts/build-stock-curation.mjs — edit OVERRIDES there.`,
  ` * Visual check: https://images.unsplash.com/photo-{id}?w=400`,
  ` */`,
  ``,
  `/** @type {Record<string, { tags: string[], subjects: string[], shapes?: string[] }>} */`,
  `export const CURATED_BY_UNSPLASH_ID = {`,
];

for (const id of allIds) {
  const c = curated[id];
  lines.push(`  "${id}": {`);
  lines.push(`    tags: ${JSON.stringify(c.tags)},`);
  lines.push(`    subjects: ${JSON.stringify(c.subjects)},`);
  if (c.shapes.length) lines.push(`    shapes: ${JSON.stringify(c.shapes)},`);
  lines.push(`  },`);
}
lines.push(`};`);
lines.push(``);
lines.push(`/**`);
lines.push(` * @param {{ unsplashId: string, theme: string, tags: string[], subjects: string[], shapes?: string[], bucket: string }} row`);
lines.push(` */`);
lines.push(`export function applyCuratedLabels(row) {`);
lines.push(`  const c = CURATED_BY_UNSPLASH_ID[row.unsplashId];`);
lines.push(`  if (!c) return row;`);
lines.push(`  return {`);
lines.push(`    ...row,`);
lines.push(`    tags: c.tags,`);
lines.push(`    subjects: c.subjects,`);
lines.push(`    shapes: c.shapes ?? row.shapes ?? [],`);
lines.push(`  };`);
lines.push(`}`);

const outPath = path.join(__dirname, "stock-pool-curation.mjs");
fs.writeFileSync(outPath, lines.join("\n") + "\n", "utf8");
console.log(`Wrote ${Object.keys(curated).length} curated entries → ${outPath}`);
