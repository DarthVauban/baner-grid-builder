import AddRounded from '@mui/icons-material/AddRounded';
import AccessTimeRounded from '@mui/icons-material/AccessTimeRounded';
import AlarmRounded from '@mui/icons-material/AlarmRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import CalendarMonthRounded from '@mui/icons-material/CalendarMonthRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DashboardCustomizeRounded from '@mui/icons-material/DashboardCustomizeRounded';
import DarkModeRounded from '@mui/icons-material/DarkModeRounded';
import EditRounded from '@mui/icons-material/EditRounded';
import FullscreenExitRounded from '@mui/icons-material/FullscreenExitRounded';
import FullscreenRounded from '@mui/icons-material/FullscreenRounded';
import GridViewRounded from '@mui/icons-material/GridViewRounded';
import GroupRounded from '@mui/icons-material/GroupRounded';
import SettingsInputComponentRounded from '@mui/icons-material/SettingsInputComponentRounded';
import HomeRounded from '@mui/icons-material/HomeRounded';
import ChecklistRounded from '@mui/icons-material/ChecklistRounded';
import ChatBubbleOutlineRounded from '@mui/icons-material/ChatBubbleOutlineRounded';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import MenuRounded from '@mui/icons-material/MenuRounded';
import NotificationsNoneRounded from '@mui/icons-material/NotificationsNoneRounded';
import LocationOnOutlined from '@mui/icons-material/LocationOnOutlined';
import LightModeRounded from '@mui/icons-material/LightModeRounded';
import MeetingRoomOutlined from '@mui/icons-material/MeetingRoomOutlined';
import MoreHorizRounded from '@mui/icons-material/MoreHorizRounded';
import OpenInNewRounded from '@mui/icons-material/OpenInNewRounded';
import PhoneOutlined from '@mui/icons-material/PhoneOutlined';
import FlagOutlined from '@mui/icons-material/FlagOutlined';
import PublishRounded from '@mui/icons-material/PublishRounded';
import ImageOutlined from '@mui/icons-material/ImageOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import RemoveRounded from '@mui/icons-material/RemoveRounded';
import SaveRounded from '@mui/icons-material/SaveRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import ShareRounded from '@mui/icons-material/ShareRounded';
import UploadFileRounded from '@mui/icons-material/UploadFileRounded';
import VideoCameraFrontOutlined from '@mui/icons-material/VideoCameraFrontOutlined';
import GridOnRounded from '@mui/icons-material/GridOnRounded';
import TableChartOutlined from '@mui/icons-material/TableChartOutlined';
import ArticleOutlined from '@mui/icons-material/ArticleOutlined';
import ViewAgendaOutlined from '@mui/icons-material/ViewAgendaOutlined';
import VisibilityOutlined from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlined from '@mui/icons-material/VisibilityOffOutlined';
import PasswordRounded from '@mui/icons-material/PasswordRounded';
import ReplyRounded from '@mui/icons-material/ReplyRounded';
import LinkRounded from '@mui/icons-material/LinkRounded';
import AddReactionOutlined from '@mui/icons-material/AddReactionOutlined';
import type { SvgIconComponent } from '@mui/icons-material';

export type IconName =
  | 'add'
  | 'alarm'
  | 'arrow'
  | 'arrowLeft'
  | 'arrowRight'
  | 'bell'
  | 'bannerGrid'
  | 'blogPublications'
  | 'calendar'
  | 'check'
  | 'chat'
  | 'chevronLeft'
  | 'chevronRight'
  | 'close'
  | 'copy'
  | 'delete'
  | 'deadline'
  | 'darkMode'
  | 'edit'
  | 'fullscreen'
  | 'fullscreenExit'
  | 'home'
  | 'integrations'
  | 'logout'
  | 'menu'
  | 'location'
  | 'lightMode'
  | 'offlineMeeting'
  | 'onlineMeeting'
  | 'openInNew'
  | 'other'
  | 'phone'
  | 'publication'
  | 'productSelection'
  | 'productTables'
  | 'remove'
  | 'save'
  | 'search'
  | 'share'
  | 'schedule'
  | 'savedBanners'
  | 'savedGrids'
  | 'tasks'
  | 'tools'
  | 'upload'
  | 'users'
  | 'viewGrid'
  | 'viewList'
  | 'visibility'
  | 'visibilityOff'
  | 'password'
  | 'reply'
  | 'link'
  | 'reaction';

interface IconProps {
  name: IconName;
  size?: number;
}

const icons: Record<IconName, SvgIconComponent> = {
  add: AddRounded,
  alarm: AlarmRounded,
  arrow: ChevronRightRounded,
  arrowLeft: ArrowBackRounded,
  arrowRight: ArrowForwardRounded,
  bell: NotificationsNoneRounded,
  bannerGrid: DashboardCustomizeRounded,
  blogPublications: ArticleOutlined,
  calendar: CalendarMonthRounded,
  check: CheckRounded,
  chat: ChatBubbleOutlineRounded,
  chevronLeft: ChevronLeftRounded,
  chevronRight: ChevronRightRounded,
  close: CloseRounded,
  copy: ContentCopyRounded,
  delete: DeleteOutlineRounded,
  deadline: FlagOutlined,
  darkMode: DarkModeRounded,
  edit: EditRounded,
  fullscreen: FullscreenRounded,
  fullscreenExit: FullscreenExitRounded,
  home: HomeRounded,
  integrations: SettingsInputComponentRounded,
  logout: LogoutRounded,
  menu: MenuRounded,
  location: LocationOnOutlined,
  lightMode: LightModeRounded,
  offlineMeeting: MeetingRoomOutlined,
  onlineMeeting: VideoCameraFrontOutlined,
  openInNew: OpenInNewRounded,
  other: MoreHorizRounded,
  phone: PhoneOutlined,
  publication: PublishRounded,
  productSelection: Inventory2Outlined,
  productTables: TableChartOutlined,
  remove: RemoveRounded,
  save: SaveRounded,
  search: SearchRounded,
  share: ShareRounded,
  schedule: AccessTimeRounded,
  savedBanners: ImageOutlined,
  savedGrids: GridOnRounded,
  tasks: ChecklistRounded,
  tools: GridViewRounded,
  upload: UploadFileRounded,
  users: GroupRounded,
  viewGrid: GridViewRounded,
  viewList: ViewAgendaOutlined,
  visibility: VisibilityOutlined,
  visibilityOff: VisibilityOffOutlined,
  password: PasswordRounded,
  reply: ReplyRounded,
  link: LinkRounded,
  reaction: AddReactionOutlined
};

export function Icon({ name, size = 20 }: IconProps) {
  const Component = icons[name];
  return (
    <Component
      aria-hidden
      className="icon"
      width={size}
      height={size}
      fill="currentColor"
      style={{ width: size, height: size, fontSize: size, fill: 'currentColor' }}
    />
  );
}
