import React from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Award,
  Bell,
  Camera,
  Check,
  ChevronRight,
  Clock,
  EyeOff,
  Globe,
  Heart,
  Image as ImageIcon,
  Inbox,
  Layers,
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

const ICONS: Record<string, LucideIcon> = {
  "alert-circle": AlertCircle,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  award: Award,
  bell: Bell,
  camera: Camera,
  check: Check,
  "chevron-right": ChevronRight,
  clock: Clock,
  "eye-off": EyeOff,
  globe: Globe,
  heart: Heart,
  image: ImageIcon,
  inbox: Inbox,
  layers: Layers,
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
  wave: Waves,
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
