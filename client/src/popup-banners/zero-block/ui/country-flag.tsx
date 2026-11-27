
/** SVG assets are copied from the pinned ISO flag collection at build time. */
export function CountryFlag({ country, apiBase = '' }: { country: string; apiBase?: string }) {
  return <img src={`${apiBase}/api/public/popup-banners/zero-block/flags/${country.toLowerCase()}.svg`} width={20} height={15} alt="" className="ui-country-flag"/>;
}
