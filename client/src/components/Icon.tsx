import AddRounded from '@mui/icons-material/AddRounded';
import AccessTimeRounded from '@mui/icons-material/AccessTimeRounded';
import AccountTreeRounded from '@mui/icons-material/AccountTreeRounded';
import AlarmRounded from '@mui/icons-material/AlarmRounded';
import ArrowBackRounded from '@mui/icons-material/ArrowBackRounded';
import KeyboardArrowDownRounded from '@mui/icons-material/KeyboardArrowDownRounded';
import KeyboardArrowUpRounded from '@mui/icons-material/KeyboardArrowUpRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import CalendarMonthRounded from '@mui/icons-material/CalendarMonthRounded';
import CheckRounded from '@mui/icons-material/CheckRounded';
import ChevronLeftRounded from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import ContentCopyRounded from '@mui/icons-material/ContentCopyRounded';
import DeleteOutlineRounded from '@mui/icons-material/DeleteOutlineRounded';
import DynamicFormRounded from '@mui/icons-material/DynamicFormRounded';
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
import AndroidRounded from '@mui/icons-material/AndroidRounded';
import Apple from '@mui/icons-material/Apple';
import QrCode2Rounded from '@mui/icons-material/QrCode2Rounded';
import SecurityRounded from '@mui/icons-material/SecurityRounded';
import DevicesRounded from '@mui/icons-material/DevicesRounded';
import SellOutlined from '@mui/icons-material/SellOutlined';
import TuneRounded from '@mui/icons-material/TuneRounded';
import StorefrontRounded from '@mui/icons-material/StorefrontRounded';
import StyleOutlined from '@mui/icons-material/StyleOutlined';
import WebRounded from '@mui/icons-material/WebRounded';
import HistoryRounded from '@mui/icons-material/HistoryRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';
import type { SvgIconComponent } from '@mui/icons-material';

export type IconName =
  | 'add'
  | 'alarm'
  | 'android'
  | 'apple'
  | 'arrow'
  | 'arrowLeft'
  | 'arrowRight'
  | 'arrowUp'
  | 'arrowDown'
  | 'bell'
  | 'bannerGrid'
  | 'blogPublications'
  | 'brands'
  | 'calendar'
  | 'catalog'
  | 'characteristics'
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
  | 'formBuilder'
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
  | 'productCard'
  | 'productPage'
  | 'productTables'
  | 'qrCode'
  | 'remove'
  | 'save'
  | 'search'
  | 'security'
  | 'share'
  | 'schedule'
  | 'savedBanners'
  | 'savedGrids'
  | 'storefront'
  | 'history'
  | 'undo'
  | 'tasks'
  | 'tools'
  | 'upload'
  | 'users'
  | 'variants'
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
  android: AndroidRounded,
  apple: Apple,
  arrow: ChevronRightRounded,
  arrowLeft: ArrowBackRounded,
  arrowRight: ArrowForwardRounded,
  arrowUp: KeyboardArrowUpRounded,
  arrowDown: KeyboardArrowDownRounded,
  bell: NotificationsNoneRounded,
  bannerGrid: DashboardCustomizeRounded,
  blogPublications: ArticleOutlined,
  brands: SellOutlined,
  calendar: CalendarMonthRounded,
  catalog: DevicesRounded,
  characteristics: TuneRounded,
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
  formBuilder: DynamicFormRounded,
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
  productCard: StyleOutlined,
  productPage: WebRounded,
  productTables: TableChartOutlined,
  qrCode: QrCode2Rounded,
  remove: RemoveRounded,
  save: SaveRounded,
  search: SearchRounded,
  security: SecurityRounded,
  share: ShareRounded,
  schedule: AccessTimeRounded,
  savedBanners: ImageOutlined,
  savedGrids: GridOnRounded,
  storefront: StorefrontRounded,
  history: HistoryRounded,
  undo: UndoRounded,
  tasks: ChecklistRounded,
  tools: GridViewRounded,
  upload: UploadFileRounded,
  users: GroupRounded,
  variants: AccountTreeRounded,
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
