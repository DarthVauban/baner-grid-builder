import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { MediaLibraryBrowser } from '../components/MediaLibraryBrowser';

export function MediaLibraryPage() {
  return <div className="media-library-page">
    <header className="page-heading page-heading--row">
      <div><p className="eyebrow">Медіабібліотека</p><h1>Файлове сховище</h1><p>Завантажуйте зображення, керуйте alt-текстами та копіюйте готові URL. Усі файли автоматично конвертуються у WebP.</p></div>
      <div className="page-heading__actions"><Link className="button button--secondary" to="/tools/blog-publications"><Icon name="arrowLeft" size={18} /> До публікацій</Link></div>
    </header>
    <MediaLibraryBrowser />
  </div>;
}
