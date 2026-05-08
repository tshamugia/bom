import {
  Search, Plus, X, Check, ChevronRight, ChevronDown, SlidersHorizontal as Sliders,
  Filter, Download, Upload, Eye, Trash2 as Trash, Home, List, Box, Truck, History,
  CheckCircle2 as CheckCircle, FileText as Doc, Settings, Pencil as Edit, Send,
  Bell, Sparkles as Spark, Folder, Calendar, Copy, Star, ArrowRight, ArrowLeft,
  MoreHorizontal as More, Sheet, Printer as Print, Link as LinkIcon,
  Activity, AlertTriangle, LogOut, Users as UsersIcon,
  User, Sun, Moon, Monitor, Palette,
} from "lucide-react";

export const Icon = {
  Search, Plus, X, Check, Chevron: ChevronRight, ChevDown: ChevronDown, Sliders,
  Filter, Download, Upload, Eye, Trash, Home, List, Box, Truck, History, CheckCircle,
  Doc, Settings, Edit, Send, Bell, Spark, Folder, Calendar, Copy, Star,
  ArrowRight, ArrowLeft, More, Sheet, Print, Link: LinkIcon,
  Activity, AlertTriangle, LogOut, Users: UsersIcon,
  User, Sun, Moon, Monitor, Palette,
} as const;

export type IconName = keyof typeof Icon;
