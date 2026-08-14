import { createRoot } from 'react-dom/client';
import { SupportChatWidgetApp } from './app/SupportChatWidgetApp';
import './styles/support-chat-widget.css';

const root = document.getElementById('support-chat-root');
if (root) createRoot(root).render(<SupportChatWidgetApp />);
