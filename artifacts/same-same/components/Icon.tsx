import React from "react";
import { WaveIcon, WaveGlyphIcon } from "@/components/WaveIcon";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Award,
  Bell,
  Camera,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Compass,
  Download,
  EyeOff,
  FlameKindling,
  Globe,
  Heart,
  Home as HomeIcon,
  Image as ImageIcon,
  Inbox,
  Layers,
  Lock,
  Link as LinkIcon,
  Map,
  MapPin,
  Maximize2,
  Mic,
  Play,
  Send,
  Sparkles,
  RefreshCw,
  RotateCcw,
  Share2,
  Star,
  User,
  Volume2,
  VolumeX,
  Waves,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react-native";

type IconComponent = React.ComponentType<{
  size?: number;
  color?: string;
  style?: object;
}>;

const ICONS: Record<string, IconComponent | LucideIcon> = {
  "alert-circle": AlertCircle,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  award: Award,
  bell: Bell,
  camera: Camera,
  campfire: FlameKindling,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-left": ChevronLeft,
  "chevron-right": ChevronRight,
  "chevron-up": ChevronUp,
  clock: Clock,
  compass: Compass,
  download: Download,
  "eye-off": EyeOff,
  globe: Globe,
  heart: Heart,
  home: HomeIcon,
  image: ImageIcon,
  inbox: Inbox,
  layers: Layers,
  lock: Lock,
  link: LinkIcon,
  map: Map,
  "map-pin": MapPin,
  maximize: Maximize2,
  mic: Mic,
  play: Play,
  send: Send,
  sparkles: Sparkles,
  "refresh-cw": RefreshCw,
  "rotate-ccw": RotateCcw,
  share: Share2,
  star: Star,
  user: User,
  volume2: Volume2,
  volumeX: VolumeX,
  wave: WaveIcon,
  "wave-glyph": WaveGlyphIcon,
  ripple: Waves,
  x: X,
  zap: Zap,
};

export type IconName = keyof typeof ICONS;

interface IconProps {
  name: string;
  size?: number;
  color?: string;
  style?: object;
}

export function Icon({ name, size = 24, color = "#000", style }: IconProps) {
  const Component = ICONS[name] ?? ICONS.award;
  return <Component size={size} color={color} style={style} />;
}
