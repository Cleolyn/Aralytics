import React from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon, Alert02Icon, AlertCircleIcon, ArrowDown01Icon, ArrowLeft01Icon, ArrowRight01Icon, ArrowUp01Icon,
  BookOpen01Icon, Cancel01Icon, CheckmarkCircle02Icon, ChartColumnIcon, Clock01Icon, DashboardSquare01Icon, Delete02Icon,
  Download01Icon, Edit02Icon, FileUploadIcon, Flag01Icon, Globe02Icon, HelpCircleIcon, Logout01Icon, Maximize01Icon,
  Menu01Icon, MortarboardIcon, RefreshIcon, Shield01Icon, Task01Icon, TaskDone01Icon, Tick02Icon, UserMultipleIcon,
  Wifi01Icon, WifiOff01Icon, Xls01Icon
} from '@hugeicons/core-free-icons';

const make = (icon, name) => {
  const Icon = ({ size = 24, strokeWidth = 1.75, ...props }) => <HugeiconsIcon icon={icon} size={size} strokeWidth={strokeWidth} {...props} />;
  Icon.displayName = name;
  return Icon;
};

export const AlertCircle = make(AlertCircleIcon, 'AlertCircle');
export const AlertTriangle = make(Alert02Icon, 'AlertTriangle');
export const ArrowDown = make(ArrowDown01Icon, 'ArrowDown');
export const ArrowLeft = make(ArrowLeft01Icon, 'ArrowLeft');
export const ArrowRight = make(ArrowRight01Icon, 'ArrowRight');
export const ArrowUp = make(ArrowUp01Icon, 'ArrowUp');
export const BookOpen = make(BookOpen01Icon, 'BookOpen');
export const ChartNoAxesColumn = make(ChartColumnIcon, 'ChartNoAxesColumn');
export const Check = make(Tick02Icon, 'Check');
export const CheckCircle2 = make(CheckmarkCircle02Icon, 'CheckCircle2');
export const ClipboardCheck = make(TaskDone01Icon, 'ClipboardCheck');
export const ClipboardList = make(Task01Icon, 'ClipboardList');
export const Clock = make(Clock01Icon, 'Clock');
export const Download = make(Download01Icon, 'Download');
export const Edit3 = make(Edit02Icon, 'Edit3');
export const FileSpreadsheet = make(Xls01Icon, 'FileSpreadsheet');
export const FileUp = make(FileUploadIcon, 'FileUp');
export const Flag = make(Flag01Icon, 'Flag');
export const Globe2 = make(Globe02Icon, 'Globe2');
export const GraduationCap = make(MortarboardIcon, 'GraduationCap');
export const HelpCircle = make(HelpCircleIcon, 'HelpCircle');
export const LayoutDashboard = make(DashboardSquare01Icon, 'LayoutDashboard');
export const LogOut = make(Logout01Icon, 'LogOut');
export const Maximize2 = make(Maximize01Icon, 'Maximize2');
export const Menu = make(Menu01Icon, 'Menu');
export const Plus = make(Add01Icon, 'Plus');
export const RefreshCw = make(RefreshIcon, 'RefreshCw');
export const ShieldAlert = make(Shield01Icon, 'ShieldAlert');
export const Trash2 = make(Delete02Icon, 'Trash2');
export const Users = make(UserMultipleIcon, 'Users');
export const Wifi = make(Wifi01Icon, 'Wifi');
export const WifiOff = make(WifiOff01Icon, 'WifiOff');
export const X = make(Cancel01Icon, 'X');
