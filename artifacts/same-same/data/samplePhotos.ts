export interface SamplePhoto {
  id: string;
  uri: string;
  country: string;
  countryCode: string;
  countryFlag: string;
  theme: string;
  minutesAgo: number;
  tags: string[];
}

export const SAMPLE_PHOTOS: SamplePhoto[] = [
  {
    id: "1",
    uri: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400",
    country: "Ethiopia",
    countryCode: "ET",
    countryFlag: "🇪🇹",
    theme: "morning",
    minutesAgo: 45,
    tags: ["coffee","drink","people","art","warm"],
  },
  {
    id: "2",
    uri: "https://images.unsplash.com/photo-1541167760496-1628856ab772?w=400",
    country: "Japan",
    countryCode: "JP",
    countryFlag: "🇯🇵",
    theme: "morning",
    minutesAgo: 127,
    tags: ["coffee","drink","people","art","warm"],
  },
  {
    id: "3",
    uri: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=400",
    country: "Mexico",
    countryCode: "MX",
    countryFlag: "🇲🇽",
    theme: "food",
    minutesAgo: 210,
    tags: ["meal"],
  },
  {
    id: "4",
    uri: "https://images.unsplash.com/photo-1476224203421-9ac39bcb3327?w=400",
    country: "India",
    countryCode: "IN",
    countryFlag: "🇮🇳",
    theme: "food",
    minutesAgo: 68,
    tags: ["meal","bread","drink","warm"],
  },
  {
    id: "5",
    uri: "https://images.unsplash.com/photo-1557804506-669a67965ba0?w=400",
    country: "Peru",
    countryCode: "PE",
    countryFlag: "🇵🇪",
    theme: "work",
    minutesAgo: 361,
    tags: ["people","coffee","laptop","desk"],
  },
  {
    id: "6",
    uri: "https://images.unsplash.com/photo-1553877522-43269d4ea984?w=400",
    country: "Germany",
    countryCode: "DE",
    countryFlag: "🇩🇪",
    theme: "work",
    minutesAgo: 22,
    tags: ["people","desk","laptop"],
  },
  {
    id: "7",
    uri: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=400",
    country: "Norway",
    countryCode: "NO",
    countryFlag: "🇳🇴",
    theme: "nature",
    minutesAgo: 720,
    tags: ["mountains","clouds","sunset","outdoors"],
  },
  {
    id: "8",
    uri: "https://images.unsplash.com/photo-1518548419970-58e3b4079ab2?w=400",
    country: "Kenya",
    countryCode: "KE",
    countryFlag: "🇰🇪",
    theme: "nature",
    minutesAgo: 244,
    tags: ["sunset","water","outdoors","clouds","trees","warm"],
  },
  {
    id: "9",
    uri: "https://images.unsplash.com/photo-1516627145497-ae6968895b74?w=400",
    country: "Brazil",
    countryCode: "BR",
    countryFlag: "🇧🇷",
    theme: "joy",
    minutesAgo: 18,
    tags: ["people"],
  },
  {
    id: "10",
    uri: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=400",
    country: "South Korea",
    countryCode: "KR",
    countryFlag: "🇰🇷",
    theme: "joy",
    minutesAgo: 480,
    tags: ["water","art"],
  },
  {
    id: "11",
    uri: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e?w=400",
    country: "Morocco",
    countryCode: "MA",
    countryFlag: "🇲🇦",
    theme: "hands",
    minutesAgo: 153,
    tags: ["warm"],
  },
  {
    id: "12",
    uri: "https://images.unsplash.com/photo-1574169208507-84376144848b?w=400",
    country: "Argentina",
    countryCode: "AR",
    countryFlag: "🇦🇷",
    theme: "hands",
    minutesAgo: 1090,
    tags: ["art","clouds","water","night","stars","sunset"],
  },
  {
    id: "13",
    uri: "https://images.unsplash.com/photo-1548247416-ec66f4900b2e?w=400",
    country: "Finland",
    countryCode: "FI",
    countryFlag: "🇫🇮",
    theme: "pets",
    minutesAgo: 96,
    tags: ["cat","animal","wildlife"],
  },
  {
    id: "14",
    uri: "https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=400",
    country: "Australia",
    countryCode: "AU",
    countryFlag: "🇦🇺",
    theme: "pets",
    minutesAgo: 1440,
    tags: ["dog","animal","smile","outdoors","water"],
  },
  {
    id: "15",
    uri: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=400",
    country: "China",
    countryCode: "CN",
    countryFlag: "🇨🇳",
    theme: "commute",
    minutesAgo: 305,
    tags: ["transit","mountains","night","outdoors"],
  },
  {
    id: "16",
    uri: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=400",
    country: "United Kingdom",
    countryCode: "GB",
    countryFlag: "🇬🇧",
    theme: "commute",
    minutesAgo: 185,
    tags: ["city","water","outdoors","sunset","clouds"],
  },
  {
    id: "17",
    uri: "https://images.unsplash.com/photo-1559827260-dc66d52bef19?w=400",
    country: "Maldives",
    countryCode: "MV",
    countryFlag: "🇲🇻",
    theme: "sky",
    minutesAgo: 2160,
    tags: ["water","clouds","sunset","outdoors"],
  },
  {
    id: "18",
    uri: "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=400",
    country: "Mongolia",
    countryCode: "MN",
    countryFlag: "🇲🇳",
    theme: "sky",
    minutesAgo: 425,
    tags: ["stars","night","mountains","outdoors"],
  },
  {
    id: "19",
    uri: "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=400",
    country: "Canada",
    countryCode: "CA",
    countryFlag: "🇨🇦",
    theme: "nature",
    minutesAgo: 95,
    tags: ["sunset","clouds","mountains","outdoors"],
  },
  {
    id: "20",
    uri: "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=400",
    country: "South Africa",
    countryCode: "ZA",
    countryFlag: "🇿🇦",
    theme: "sky",
    minutesAgo: 38,
    tags: ["sunset","outdoors","trees","warm"],
  },
  {
    id: "21",
    uri: "https://images.unsplash.com/photo-1502082553048-f009c37129b9?w=400",
    country: "New Zealand",
    countryCode: "NZ",
    countryFlag: "🇳🇿",
    theme: "nature",
    minutesAgo: 510,
    tags: ["trees","outdoors","clouds","warm","sunset"],
  },
  { id: "22", uri: "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=400", country: "Italy", countryCode: "IT", countryFlag: "🇮🇹", theme: "morning", minutesAgo: 12, tags: ["coffee","drink","warm"] },
  { id: "23", uri: "https://images.unsplash.com/photo-1521017432531-fbd92d768814?w=400", country: "Vietnam", countryCode: "VN", countryFlag: "🇻🇳", theme: "morning", minutesAgo: 88, tags: ["coffee","drink"] },
  { id: "24", uri: "https://images.unsplash.com/photo-1494314671902-399b18174975?w=400", country: "Turkey", countryCode: "TR", countryFlag: "🇹🇷", theme: "morning", minutesAgo: 320, tags: ["coffee","drink","warm"] },
  { id: "25", uri: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400", country: "Spain", countryCode: "ES", countryFlag: "🇪🇸", theme: "morning", minutesAgo: 7, tags: ["coffee","drink","art"] },
  { id: "26", uri: "https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400", country: "Thailand", countryCode: "TH", countryFlag: "🇹🇭", theme: "food", minutesAgo: 33, tags: ["meal","warm"] },
  { id: "27", uri: "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?w=400", country: "France", countryCode: "FR", countryFlag: "🇫🇷", theme: "food", minutesAgo: 145, tags: ["meal","bread"] },
  { id: "28", uri: "https://images.unsplash.com/photo-1551782450-a2132b4ba21d?w=400", country: "United States", countryCode: "US", countryFlag: "🇺🇸", theme: "food", minutesAgo: 62, tags: ["meal","bread"] },
  { id: "29", uri: "https://images.unsplash.com/photo-1565958011703-44f9829ba187?w=400", country: "Greece", countryCode: "GR", countryFlag: "🇬🇷", theme: "food", minutesAgo: 415, tags: ["meal","bread","drink"] },
  { id: "30", uri: "https://images.unsplash.com/photo-1499951360447-b19be8fe80f5?w=400", country: "Netherlands", countryCode: "NL", countryFlag: "🇳🇱", theme: "work", minutesAgo: 51, tags: ["laptop","desk","coffee"] },
  { id: "31", uri: "https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=400", country: "Sweden", countryCode: "SE", countryFlag: "🇸🇪", theme: "work", minutesAgo: 200, tags: ["laptop","desk"] },
  { id: "32", uri: "https://images.unsplash.com/photo-1483450388369-9ed95738483c?w=400", country: "Iceland", countryCode: "IS", countryFlag: "🇮🇸", theme: "nature", minutesAgo: 920, tags: ["mountains","sunset","clouds","outdoors"] },
  { id: "33", uri: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=400", country: "Switzerland", countryCode: "CH", countryFlag: "🇨🇭", theme: "nature", minutesAgo: 14, tags: ["mountains","clouds","outdoors","sunset"] },
  { id: "34", uri: "https://images.unsplash.com/photo-1418065460487-3e41a6c84dc5?w=400", country: "Chile", countryCode: "CL", countryFlag: "🇨🇱", theme: "nature", minutesAgo: 175, tags: ["mountains","outdoors","trees"] },
  { id: "35", uri: "https://images.unsplash.com/photo-1470770841072-f978cf4d019e?w=400", country: "Ireland", countryCode: "IE", countryFlag: "🇮🇪", theme: "nature", minutesAgo: 605, tags: ["mountains","clouds","water","outdoors"] },
  { id: "36", uri: "https://images.unsplash.com/photo-1444080748397-f442aa95c3e5?w=400", country: "Egypt", countryCode: "EG", countryFlag: "🇪🇬", theme: "sky", minutesAgo: 41, tags: ["sunset","clouds","outdoors","warm"] },
  { id: "37", uri: "https://images.unsplash.com/photo-1419833173245-f59e1b93f9ee?w=400", country: "Portugal", countryCode: "PT", countryFlag: "🇵🇹", theme: "sky", minutesAgo: 220, tags: ["sunset","clouds","water","outdoors"] },
  { id: "38", uri: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=400", country: "Nepal", countryCode: "NP", countryFlag: "🇳🇵", theme: "sky", minutesAgo: 770, tags: ["clouds","mountains","outdoors","warm"] },
  { id: "39", uri: "https://images.unsplash.com/photo-1517524206127-48bbd363f3d7?w=400", country: "Indonesia", countryCode: "ID", countryFlag: "🇮🇩", theme: "hands", minutesAgo: 26, tags: ["art","people"] },
  { id: "40", uri: "https://images.unsplash.com/photo-1521336575822-6da63fb45455?w=400", country: "Colombia", countryCode: "CO", countryFlag: "🇨🇴", theme: "hands", minutesAgo: 380, tags: ["art","warm"] },
  { id: "41", uri: "https://images.unsplash.com/photo-1517242810446-cc8951b2be40?w=400", country: "Senegal", countryCode: "SN", countryFlag: "🇸🇳", theme: "hands", minutesAgo: 105, tags: ["people","art"] },
  { id: "42", uri: "https://images.unsplash.com/photo-1517423440428-a5a00ad493e8?w=400", country: "Russia", countryCode: "RU", countryFlag: "🇷🇺", theme: "pets", minutesAgo: 60, tags: ["dog","animal","outdoors"] },
  { id: "43", uri: "https://images.unsplash.com/photo-1573865526739-10659fec78a5?w=400", country: "Vietnam", countryCode: "VN", countryFlag: "🇻🇳", theme: "pets", minutesAgo: 240, tags: ["cat","animal"] },
  { id: "44", uri: "https://images.unsplash.com/photo-1592194996308-7b43878e84a6?w=400", country: "Belgium", countryCode: "BE", countryFlag: "🇧🇪", theme: "pets", minutesAgo: 480, tags: ["dog","animal","smile","outdoors"] },
  { id: "45", uri: "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=400", country: "Singapore", countryCode: "SG", countryFlag: "🇸🇬", theme: "commute", minutesAgo: 18, tags: ["city","transit","night"] },
  { id: "46", uri: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=400", country: "United States", countryCode: "US", countryFlag: "🇺🇸", theme: "commute", minutesAgo: 132, tags: ["transit","city"] },
  { id: "47", uri: "https://images.unsplash.com/photo-1473625247510-8ceb1760943f?w=400", country: "Hong Kong", countryCode: "HK", countryFlag: "🇭🇰", theme: "commute", minutesAgo: 75, tags: ["city","night","transit"] },
  { id: "48", uri: "https://images.unsplash.com/photo-1530103862676-de8c9debad1d?w=400", country: "Mexico", countryCode: "MX", countryFlag: "🇲🇽", theme: "joy", minutesAgo: 22, tags: ["people","smile","celebration"] },
  { id: "49", uri: "https://images.unsplash.com/photo-1543610892-0b1f7e6d8ac1?w=400", country: "Nigeria", countryCode: "NG", countryFlag: "🇳🇬", theme: "joy", minutesAgo: 195, tags: ["people","smile","celebration"] },
  { id: "50", uri: "https://images.unsplash.com/photo-1527525443983-6e60c75fff46?w=400", country: "Philippines", countryCode: "PH", countryFlag: "🇵🇭", theme: "joy", minutesAgo: 88, tags: ["people","smile","celebration"] },
  { id: "51", uri: "https://images.unsplash.com/photo-1441829266145-6d4bfb7a3a48?w=400", country: "Tanzania", countryCode: "TZ", countryFlag: "🇹🇿", theme: "nature", minutesAgo: 350, tags: ["wildlife","animal","outdoors"] },
  { id: "52", uri: "https://images.unsplash.com/photo-1437824368796-d7c7c0fb39b1?w=400", country: "Botswana", countryCode: "BW", countryFlag: "🇧🇼", theme: "pets", minutesAgo: 1100, tags: ["wildlife","animal","outdoors"] },
  // ── Launch-day pool expansion ──────────────────────────────────────────
  // Each entry below uses a Unsplash image already proven loadable in
  // SYNTH_PHOTO_BANK. Tags are intentionally narrow — only what is
  // visually undeniable in the photo — to keep "Both have …" honest.
  // Coffee / morning
  { id: "53", uri: "https://images.unsplash.com/photo-1497935586351-b67a49e012bf?w=400", country: "Czechia", countryCode: "CZ", countryFlag: "🇨🇿", theme: "morning", minutesAgo: 19, tags: ["coffee","drink","cafe"] },
  { id: "54", uri: "https://images.unsplash.com/photo-1542990253-0d0f5be5f0ed?w=400", country: "Denmark", countryCode: "DK", countryFlag: "🇩🇰", theme: "morning", minutesAgo: 92, tags: ["coffee","drink","warm"] },
  { id: "55", uri: "https://images.unsplash.com/photo-1497636577773-f1231844b336?w=400", country: "Austria", countryCode: "AT", countryFlag: "🇦🇹", theme: "morning", minutesAgo: 250, tags: ["coffee","drink"] },
  { id: "56", uri: "https://images.unsplash.com/photo-1466637574441-749b8f19452f?w=400", country: "Hungary", countryCode: "HU", countryFlag: "🇭🇺", theme: "morning", minutesAgo: 410, tags: ["coffee","cafe"] },
  // Food / meals
  { id: "57", uri: "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=400", country: "Israel", countryCode: "IL", countryFlag: "🇮🇱", theme: "food", minutesAgo: 27, tags: ["meal","cooking"] },
  { id: "58", uri: "https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=400", country: "Lebanon", countryCode: "LB", countryFlag: "🇱🇧", theme: "food", minutesAgo: 105, tags: ["meal","bread"] },
  { id: "59", uri: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400", country: "Sri Lanka", countryCode: "LK", countryFlag: "🇱🇰", theme: "food", minutesAgo: 340, tags: ["meal","cooking","warm"] },
  { id: "60", uri: "https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400", country: "Malaysia", countryCode: "MY", countryFlag: "🇲🇾", theme: "food", minutesAgo: 56, tags: ["meal"] },
  // Workspace / desk
  { id: "61", uri: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?w=400", country: "Estonia", countryCode: "EE", countryFlag: "🇪🇪", theme: "work", minutesAgo: 44, tags: ["laptop","desk","study"] },
  { id: "62", uri: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=400", country: "Poland", countryCode: "PL", countryFlag: "🇵🇱", theme: "work", minutesAgo: 168, tags: ["laptop","desk","coffee"] },
  // Sky / sunsets
  { id: "63", uri: "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?w=400", country: "Madagascar", countryCode: "MG", countryFlag: "🇲🇬", theme: "sky", minutesAgo: 33, tags: ["sunset","clouds","outdoors"] },
  { id: "64", uri: "https://images.unsplash.com/photo-1532274402911-5a369e4c4bb5?w=400", country: "Croatia", countryCode: "HR", countryFlag: "🇭🇷", theme: "sky", minutesAgo: 470, tags: ["sunset","clouds","water","outdoors"] },
  { id: "65", uri: "https://images.unsplash.com/photo-1437604766819-5e0c5b8a40e9?w=400", country: "Cambodia", countryCode: "KH", countryFlag: "🇰🇭", theme: "sky", minutesAgo: 880, tags: ["sunset","clouds","warm"] },
  // Hands / making
  { id: "66", uri: "https://images.unsplash.com/photo-1531913764164-f85c52e6e654?w=400", country: "Bolivia", countryCode: "BO", countryFlag: "🇧🇴", theme: "hands", minutesAgo: 70, tags: ["art","crafts"] },
  { id: "67", uri: "https://images.unsplash.com/photo-1455218873509-8097305ee378?w=400", country: "Ghana", countryCode: "GH", countryFlag: "🇬🇭", theme: "hands", minutesAgo: 290, tags: ["art","people"] },
  { id: "68", uri: "https://images.unsplash.com/photo-1525373698358-041e3a460346?w=400", country: "Pakistan", countryCode: "PK", countryFlag: "🇵🇰", theme: "hands", minutesAgo: 615, tags: ["crafts","people"] },
  // Joy / smiles
  { id: "69", uri: "https://images.unsplash.com/photo-1488161628813-04466f872be2?w=400", country: "Ecuador", countryCode: "EC", countryFlag: "🇪🇨", theme: "joy", minutesAgo: 36, tags: ["people","smile","friends"] },
  // Commute / city
  { id: "70", uri: "https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=400", country: "Taiwan", countryCode: "TW", countryFlag: "🇹🇼", theme: "commute", minutesAgo: 110, tags: ["city","transit","night"] },
  // Pets reused with new countries (these images are well-loved animals)
  { id: "71", uri: "https://images.unsplash.com/photo-1548247416-ec66f4900b2e?w=400", country: "Latvia", countryCode: "LV", countryFlag: "🇱🇻", theme: "pets", minutesAgo: 50, tags: ["cat","animal"] },
  { id: "72", uri: "https://images.unsplash.com/photo-1592194996308-7b43878e84a6?w=400", country: "Romania", countryCode: "RO", countryFlag: "🇷🇴", theme: "pets", minutesAgo: 200, tags: ["dog","animal","outdoors","smile"] },
  // Active / outdoors movement
  { id: "73", uri: "https://images.unsplash.com/photo-1518611012118-696072aa579a?w=400", country: "Slovenia", countryCode: "SI", countryFlag: "🇸🇮", theme: "nature", minutesAgo: 80, tags: ["hiking","outdoors","mountains"] },
  { id: "74", uri: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=400", country: "Bulgaria", countryCode: "BG", countryFlag: "🇧🇬", theme: "nature", minutesAgo: 220, tags: ["running","fitness","outdoors"] },
  { id: "75", uri: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=400", country: "Costa Rica", countryCode: "CR", countryFlag: "🇨🇷", theme: "nature", minutesAgo: 460, tags: ["yoga","fitness","outdoors"] },
  { id: "76", uri: "https://images.unsplash.com/photo-1545205597-3d9d02c29597?w=400", country: "Lithuania", countryCode: "LT", countryFlag: "🇱🇹", theme: "nature", minutesAgo: 700, tags: ["cycling","outdoors"] },
  // Home / cozy
  { id: "77", uri: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=400", country: "Norway", countryCode: "NO", countryFlag: "🇳🇴", theme: "morning", minutesAgo: 60, tags: ["home","cozy","plants"] },
  { id: "78", uri: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400", country: "Slovakia", countryCode: "SK", countryFlag: "🇸🇰", theme: "morning", minutesAgo: 320, tags: ["plants","home","flowers"] },
  { id: "79", uri: "https://images.unsplash.com/photo-1462536943532-57a629f6cc60?w=400", country: "Iceland", countryCode: "IS", countryFlag: "🇮🇸", theme: "morning", minutesAgo: 540, tags: ["home","cozy","vintage"] },
  // Travel / cityscapes
  { id: "80", uri: "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=400", country: "United Arab Emirates", countryCode: "AE", countryFlag: "🇦🇪", theme: "commute", minutesAgo: 95, tags: ["travel","city"] },
  { id: "81", uri: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=400", country: "France", countryCode: "FR", countryFlag: "🇫🇷", theme: "commute", minutesAgo: 260, tags: ["travel","city","outdoors"] },
  { id: "82", uri: "https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=400", country: "Cuba", countryCode: "CU", countryFlag: "🇨🇺", theme: "joy", minutesAgo: 145, tags: ["travel","people","warm"] },
  { id: "83", uri: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=400", country: "Maldives", countryCode: "MV", countryFlag: "🇲🇻", theme: "nature", minutesAgo: 380, tags: ["beach","water","outdoors","sunset"] },
  { id: "84", uri: "https://images.unsplash.com/photo-1512100356356-de1b84283e18?w=400", country: "Greece", countryCode: "GR", countryFlag: "🇬🇷", theme: "nature", minutesAgo: 710, tags: ["beach","water","outdoors","warm"] },
  // Wildlife
  { id: "85", uri: "https://images.unsplash.com/photo-1441829266145-6d4bfb7a3a48?w=400", country: "Namibia", countryCode: "NA", countryFlag: "🇳🇦", theme: "nature", minutesAgo: 520, tags: ["wildlife","animal","outdoors"] },
];

// ─────────────────────────────────────────────────────────────────────────
// TEST-BUILD ONLY: synthetic candidate generator
// In production, never invent photos — match against real users only.
// This widens the pool so test users always have fresh material to swipe.
// Gated by `ENABLE_SYNTHETIC_MATCHES` below; production builds must keep
// it false (default tied to `__DEV__`, so release builds can never leak).
// ─────────────────────────────────────────────────────────────────────────

// True in Expo Go and `expo start` (dev). False in `expo export` /
// production bundles. Callers should respect this flag.
declare const __DEV__: boolean;
export const ENABLE_SYNTHETIC_MATCHES: boolean =
  typeof __DEV__ !== "undefined" ? __DEV__ : false;

const SYNTH_COUNTRY_POOL: { country: string; code: string; flag: string }[] = [
  { country: "Argentina", code: "AR", flag: "🇦🇷" },
  { country: "Australia", code: "AU", flag: "🇦🇺" },
  { country: "Austria", code: "AT", flag: "🇦🇹" },
  { country: "Bangladesh", code: "BD", flag: "🇧🇩" },
  { country: "Belgium", code: "BE", flag: "🇧🇪" },
  { country: "Bolivia", code: "BO", flag: "🇧🇴" },
  { country: "Cambodia", code: "KH", flag: "🇰🇭" },
  { country: "Croatia", code: "HR", flag: "🇭🇷" },
  { country: "Czechia", code: "CZ", flag: "🇨🇿" },
  { country: "Denmark", code: "DK", flag: "🇩🇰" },
  { country: "Ecuador", code: "EC", flag: "🇪🇨" },
  { country: "Estonia", code: "EE", flag: "🇪🇪" },
  { country: "Ghana", code: "GH", flag: "🇬🇭" },
  { country: "Hungary", code: "HU", flag: "🇭🇺" },
  { country: "Israel", code: "IL", flag: "🇮🇱" },
  { country: "Jordan", code: "JO", flag: "🇯🇴" },
  { country: "Laos", code: "LA", flag: "🇱🇦" },
  { country: "Latvia", code: "LV", flag: "🇱🇻" },
  { country: "Malaysia", code: "MY", flag: "🇲🇾" },
  { country: "Pakistan", code: "PK", flag: "🇵🇰" },
  { country: "Panama", code: "PA", flag: "🇵🇦" },
  { country: "Poland", code: "PL", flag: "🇵🇱" },
  { country: "Romania", code: "RO", flag: "🇷🇴" },
  { country: "Sri Lanka", code: "LK", flag: "🇱🇰" },
  { country: "Taiwan", code: "TW", flag: "🇹🇼" },
  { country: "Ukraine", code: "UA", flag: "🇺🇦" },
];

// Topical photo IDs grouped by theme — generator picks from these so
// synthesized "matches" still feel relevant to what the user posted.
// Expanded photo buckets for the test build's synthetic candidate generator.
// Every ID below is a real Unsplash photo and most are already used in the
// curated SAMPLE_PHOTOS pool (so we know they load reliably). The buckets
// are deliberately overfilled — when the AI suggests a freeform theme we
// want plenty of visual variety to swipe through, not the same 4 photos
// recycled with different country flags.
const SYNTH_PHOTO_BANK = {
  morning: [
    "1495474472287-4d71bcdd2085","1541167760496-1628856ab772","1509042239860-f550ce710b93",
    "1521017432531-fbd92d768814","1494314671902-399b18174975","1497935586351-b67a49e012bf",
    "1542990253-0d0f5be5f0ed","1559056199-641a0ac8b55e","1497636577773-f1231844b336",
    "1466637574441-749b8f19452f",
  ],
  food: [
    "1504674900247-0877df9cc836","1476224203421-9ac39bcb3327","1568901346375-23c9450c58cd",
    "1565299624946-b28f40a0ae38","1551782450-a2132b4ba21d","1565958011703-44f9829ba187",
    "1540189549336-e6e99c3679fe","1473093295043-cdd812d0e601","1467003909585-2f8a72700288",
    "1546069901-ba9599a7e63c",
  ],
  hands: [
    "1558769132-cb1aea458c5e","1574169208507-84376144848b","1517524206127-48bbd363f3d7",
    "1521336575822-6da63fb45455","1517242810446-cc8951b2be40","1531913764164-f85c52e6e654",
    "1455218873509-8097305ee378","1525373698358-041e3a460346",
  ],
  sky: [
    "1559827260-dc66d52bef19","1419242902214-272b3f66ee7a","1500382017468-9049fed747ef",
    "1444080748397-f442aa95c3e5","1419833173245-f59e1b93f9ee","1470071459604-3b5ec3a7fe05",
    "1500530855697-b586d89ba3ee","1532274402911-5a369e4c4bb5","1437604766819-5e0c5b8a40e9",
  ],
  commute: [
    "1544620347-c4fd4a3d5957","1513635269975-59663e0ac1ad","1480714378408-67cf0d13bc1b",
    "1504384308090-c894fdcc538d","1473625247510-8ceb1760943f","1502920917128-1aa500764cbd",
  ],
  work: [
    "1557804506-669a67965ba0","1553877522-43269d4ea984","1499951360447-b19be8fe80f5",
    "1531403009284-440f080d1e12","1517245386807-bb43f82c33c4","1496181133206-80ce9b88a853",
  ],
  joy: [
    "1516627145497-ae6968895b74","1541701494587-cb58502866ab","1530103862676-de8c9debad1d",
    "1543610892-0b1f7e6d8ac1","1527525443983-6e60c75fff46","1488161628813-04466f872be2",
  ],
  nature: [
    "1506905925346-21bda4d32df4","1518548419970-58e3b4079ab2","1483450388369-9ed95738483c",
    "1469474968028-56623f02e42e","1418065460487-3e41a6c84dc5","1470770841072-f978cf4d019e",
    "1472214103451-9374bd1c798e","1502082553048-f009c37129b9","1441829266145-6d4bfb7a3a48",
    "1500382017468-9049fed747ef",
  ],
  pets: [
    "1548247416-ec66f4900b2e","1587300003388-59208cc962cb","1517423440428-a5a00ad493e8",
    "1573865526739-10659fec78a5","1592194996308-7b43878e84a6","1437824368796-d7c7c0fb39b1",
  ],
  // New lifestyle buckets so lifestyle tags don't fall through to "joy".
  active: [
    "1518611012118-696072aa579a","1517836357463-d25dfeac3438","1571019613454-1cb2f99b2d8b",
    "1545205597-3d9d02c29597","1506905925346-21bda4d32df4","1502082553048-f009c37129b9",
  ],
  creative: [
    "1513475382585-d06e58bcb0e0","1455390582262-044cdead277a","1507003211169-0a1dd7228f2d",
    "1499951360447-b19be8fe80f5","1481627834876-b7833e8f5570","1517242810446-cc8951b2be40",
    "1521336575822-6da63fb45455",
  ],
  home: [
    "1505691938895-1758d7feb511","1416879595882-3373a0480b5b","1519710164239-da123dc03ef4",
    "1462536943532-57a629f6cc60","1493663284031-b7e3aefcae8e",
  ],
  travel: [
    "1488646953014-85cb44e25828","1502602898657-3e91760cbb34","1530789253388-582c481c54b0",
    "1507525428034-b723cf961d3e","1512100356356-de1b84283e18","1444080748397-f442aa95c3e5",
    "1419833173245-f59e1b93f9ee",
  ],
} as const;

// Map common tag IDs → SYNTH_PHOTO_BANK theme buckets so freeform user tags
// still funnel to a sensible photo bucket.
const TAG_TO_BUCKET: Record<string, keyof typeof SYNTH_PHOTO_BANK> = {
  coffee: "morning", drink: "morning", warm: "morning", cozy: "home",
  meal: "food", bread: "food", cooking: "food", baking: "food", dessert: "food", cafe: "food",
  art: "creative", crafts: "creative", music: "creative", photography: "creative", reading: "creative", fashion: "creative",
  sunset: "sky", clouds: "sky", stars: "sky", night: "sky",
  transit: "commute", city: "travel",
  laptop: "work", desk: "work", study: "work",
  smile: "joy", celebration: "joy", people: "joy", party: "joy", friends: "joy", family: "joy", kids: "joy", dancing: "joy",
  trees: "nature", mountains: "nature", outdoors: "nature", water: "nature", snow: "nature", beach: "travel",
  hiking: "active", fitness: "active", yoga: "active", cycling: "active", running: "active", sports: "active",
  travel: "travel",
  home: "home", plants: "home", flowers: "home", garden: "home", vintage: "home",
  gaming: "creative",
  dog: "pets", cat: "pets", animal: "pets", wildlife: "pets",
};

function pickFromTheme(theme: string): keyof typeof SYNTH_PHOTO_BANK {
  if (theme in SYNTH_PHOTO_BANK) return theme as keyof typeof SYNTH_PHOTO_BANK;
  return "joy";
}

// What tags genuinely describe each synthetic photo bucket. Used to honestly
// label generated candidates so the "Both have …" chip on the match screen
// only shows tags that are actually plausible for the photo shown.
const BUCKET_TAG_POOL: Record<keyof typeof SYNTH_PHOTO_BANK, string[]> = {
  morning: ["coffee", "warm", "cozy", "sunset", "drink"],
  food: ["meal", "bread", "cooking", "baking", "dessert", "drink", "cafe"],
  hands: ["art", "crafts", "people"],
  sky: ["sunset", "clouds", "stars", "night"],
  commute: ["transit", "city", "travel"],
  work: ["laptop", "desk", "study", "coffee"],
  joy: ["smile", "celebration", "people", "party", "friends", "family", "kids", "dancing"],
  nature: ["trees", "mountains", "outdoors", "water", "hiking", "snow"],
  pets: ["dog", "cat", "animal", "wildlife"],
  active: ["fitness", "yoga", "hiking", "cycling", "running", "sports", "outdoors"],
  creative: ["art", "music", "photography", "reading", "crafts", "fashion", "gaming"],
  home: ["home", "plants", "flowers", "garden", "cozy", "vintage"],
  travel: ["travel", "beach", "city", "outdoors", "mountains"],
};

// Builds synthetic candidates that look like real samples but are sampled
// dynamically. Stable-ish ids (synth-…) so React lists don't thrash.
export function generateSyntheticCandidates(
  preferredTheme: string,
  myTags: string[],
  count: number,
): SamplePhoto[] {
  // Hard gate: never synthesize in production builds.
  if (!ENABLE_SYNTHETIC_MATCHES) return [];
  // Bucket selection priority — theme FIRST, then tag-derived. Previously
  // we let a vibe tag (like "warm" or "cozy") pick the bucket before the
  // theme, which caused embarrassing mismatches: a hand photo tagged
  // "warm" would funnel into the "morning" bucket and surface coffee /
  // sunrise / kayak shots instead of other hand photos. The user's
  // explicit theme choice ("Your hands") is by far the strongest signal
  // we have, so it always wins when it maps to a real bucket.
  const themeBucket = preferredTheme in SYNTH_PHOTO_BANK
    ? (preferredTheme as keyof typeof SYNTH_PHOTO_BANK)
    : null;
  const bucketKey =
    themeBucket ??
    (myTags.map((t) => TAG_TO_BUCKET[t]).find(Boolean) as keyof typeof SYNTH_PHOTO_BANK | undefined) ??
    pickFromTheme(preferredTheme);
  const photoIds = SYNTH_PHOTO_BANK[bucketKey];
  const out: SamplePhoto[] = [];
  for (let i = 0; i < count; i++) {
    const photoId = photoIds[Math.floor(Math.random() * photoIds.length)];
    const c = SYNTH_COUNTRY_POOL[Math.floor(Math.random() * SYNTH_COUNTRY_POOL.length)];
    const minutesAgo = Math.floor(Math.random() * 60 * 24 * 3); // up to 3 days ago
    // Tag the synthetic photo with bucket-appropriate tags ONLY. Never carry
    // the user's own tags onto an unrelated image — that caused the "Both
    // have …" chip to lie. We deliberately keep at most one overlap with
    // the user's tags so the score isn't dominated by recency, but only if
    // that overlap is actually plausible for this bucket.
    const bucketTags = BUCKET_TAG_POOL[bucketKey] ?? [bucketKey];
    const overlap = myTags.find((t) => bucketTags.includes(t));
    const shuffled = [...bucketTags].sort(() => Math.random() - 0.5);
    const picked = shuffled.slice(0, 2 + Math.floor(Math.random() * 2));
    const synthTagsSet = new Set(picked);
    if (overlap) synthTagsSet.add(overlap);
    const synthTags = Array.from(synthTagsSet);
    out.push({
      id: `synth-${photoId}-${c.code}-${i}`,
      uri: `https://images.unsplash.com/photo-${photoId}?w=400`,
      country: c.country,
      countryCode: c.code,
      countryFlag: c.flag,
      theme: bucketKey,
      minutesAgo,
      tags: synthTags,
    });
  }
  return out;
}

// Tag library — what users can pick to describe their photo. Grouped so the
// camera screen can suggest the most relevant chips per theme.
export const TAG_LIBRARY: { id: string; emoji: string; label: string }[] = [
  { id: "coffee", emoji: "☕", label: "Coffee" },
  { id: "drink", emoji: "🥤", label: "Drink" },
  { id: "meal", emoji: "🍽️", label: "Meal" },
  { id: "bread", emoji: "🥖", label: "Bread" },
  { id: "warm", emoji: "🔥", label: "Warm" },
  { id: "trees", emoji: "🌳", label: "Trees" },
  { id: "sunset", emoji: "🌅", label: "Sunset" },
  { id: "clouds", emoji: "☁️", label: "Clouds" },
  { id: "stars", emoji: "✨", label: "Stars" },
  { id: "night", emoji: "🌙", label: "Night" },
  { id: "mountains", emoji: "🏔️", label: "Mountains" },
  { id: "outdoors", emoji: "🌲", label: "Outdoors" },
  { id: "water", emoji: "🌊", label: "Water" },
  { id: "wildlife", emoji: "🦌", label: "Wildlife" },
  { id: "dog", emoji: "🐕", label: "Dog" },
  { id: "cat", emoji: "🐈", label: "Cat" },
  { id: "animal", emoji: "🐾", label: "Animal" },
  { id: "people", emoji: "👤", label: "People" },
  { id: "smile", emoji: "😊", label: "Smile" },
  { id: "celebration", emoji: "🎉", label: "Celebration" },
  { id: "art", emoji: "🎨", label: "Art" },
  { id: "desk", emoji: "🖥️", label: "Desk" },
  { id: "laptop", emoji: "💻", label: "Laptop" },
  { id: "transit", emoji: "🚇", label: "Transit" },
  { id: "city", emoji: "🏙️", label: "City" },
  // Expanded interest/hobby/lifestyle vocabulary
  { id: "dessert", emoji: "🍰", label: "Dessert" },
  { id: "cooking", emoji: "🍳", label: "Cooking" },
  { id: "baking", emoji: "🧁", label: "Baking" },
  { id: "cafe", emoji: "☕", label: "Cafe" },
  { id: "beach", emoji: "🏖️", label: "Beach" },
  { id: "snow", emoji: "❄️", label: "Snow" },
  { id: "plants", emoji: "🪴", label: "Plants" },
  { id: "flowers", emoji: "🌸", label: "Flowers" },
  { id: "garden", emoji: "🌱", label: "Garden" },
  { id: "family", emoji: "👨‍👩‍👧", label: "Family" },
  { id: "friends", emoji: "🫂", label: "Friends" },
  { id: "party", emoji: "🥳", label: "Party" },
  { id: "kids", emoji: "🧒", label: "Kids" },
  { id: "photography", emoji: "📸", label: "Photography" },
  { id: "music", emoji: "🎵", label: "Music" },
  { id: "reading", emoji: "📚", label: "Reading" },
  { id: "crafts", emoji: "🧶", label: "Crafts" },
  { id: "fashion", emoji: "👗", label: "Fashion" },
  { id: "fitness", emoji: "💪", label: "Fitness" },
  { id: "yoga", emoji: "🧘", label: "Yoga" },
  { id: "hiking", emoji: "🥾", label: "Hiking" },
  { id: "cycling", emoji: "🚴", label: "Cycling" },
  { id: "running", emoji: "🏃", label: "Running" },
  { id: "sports", emoji: "⚽", label: "Sports" },
  { id: "dancing", emoji: "💃", label: "Dancing" },
  { id: "gaming", emoji: "🎮", label: "Gaming" },
  { id: "travel", emoji: "✈️", label: "Travel" },
  { id: "home", emoji: "🏠", label: "Home" },
  { id: "vintage", emoji: "📻", label: "Vintage" },
  { id: "cozy", emoji: "🛋️", label: "Cozy" },
  { id: "work", emoji: "💻", label: "Work" },
  { id: "study", emoji: "📖", label: "Study" },
];

// Suggested tag IDs surfaced first per theme on the camera screen.
export const SUGGESTED_TAGS_BY_THEME: Record<string, string[]> = {
  morning: ["coffee", "drink", "sunset", "warm", "cozy"],
  food: ["meal", "bread", "drink", "coffee", "cooking", "baking", "dessert"],
  hands: ["art", "people", "crafts"],
  sky: ["sunset", "clouds", "stars", "night", "trees"],
  commute: ["transit", "city", "travel"],
  work: ["laptop", "desk", "coffee", "study"],
  joy: ["smile", "celebration", "people", "party", "friends"],
  nature: ["trees", "mountains", "outdoors", "water", "sunset", "wildlife", "hiking"],
  pets: ["dog", "cat", "animal"],
  active: ["fitness", "yoga", "hiking", "cycling", "running", "sports"],
  creative: ["art", "music", "photography", "reading", "crafts", "fashion"],
  home: ["home", "plants", "flowers", "garden", "cozy", "vintage"],
  travel: ["travel", "beach", "mountains", "city", "outdoors"],
};

export const DAILY_CHALLENGES = [
  { id: "morning", title: "Your morning", description: "What does your morning look like?", emoji: "☀️" },
  { id: "food", title: "What you ate", description: "Share your meal", emoji: "🍽️" },
  { id: "hands", title: "Your hands", description: "Show us your hands right now", emoji: "👐" },
  { id: "sky", title: "Your sky", description: "Look up. What do you see?", emoji: "🌤️" },
  { id: "commute", title: "Your commute", description: "How do you get around?", emoji: "🚌" },
  { id: "work", title: "Where you work", description: "Show your workspace", emoji: "💼" },
  { id: "joy", title: "Something joyful", description: "What made you smile today?", emoji: "😊" },
  { id: "nature", title: "Nature near you", description: "Any plant, tree or sky", emoji: "🌿" },
  { id: "pets", title: "An animal", description: "Pet, wild, or neighbor's", emoji: "🐾" },
];

// Themes that "feel" related — used as fallback when the active theme
// pool is exhausted so the user can still find a match nearby.
export const THEME_ADJACENCY: Record<string, string[]> = {
  morning: ["food", "commute", "sky"],
  food: ["morning", "hands", "joy"],
  hands: ["food", "work", "joy"],
  sky: ["nature", "morning"],
  commute: ["morning", "work", "sky"],
  work: ["commute", "hands"],
  joy: ["pets", "food", "hands"],
  nature: ["sky", "pets"],
  pets: ["nature", "joy"],
};

export function getThemeChain(theme: string): string[] {
  const adj = THEME_ADJACENCY[theme] ?? [];
  return [theme, ...adj];
}

export function getTodaysChallenge(): typeof DAILY_CHALLENGES[0] {
  const dayOfYear = Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
  return DAILY_CHALLENGES[dayOfYear % DAILY_CHALLENGES.length];
}

export function getRandomPair(exclude?: string[]): [SamplePhoto, SamplePhoto] {
  const pool = exclude
    ? SAMPLE_PHOTOS.filter((p) => !exclude.includes(p.id))
    : SAMPLE_PHOTOS;

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return [shuffled[0], shuffled[1]];
}
