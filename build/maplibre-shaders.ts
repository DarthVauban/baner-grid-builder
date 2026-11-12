import MagicString from 'magic-string';
import type { Plugin } from 'vite';

const shaderModuleId = 'virtual:mt-maplibre-shaders';
export const resolvedShaderModuleId = `\0${shaderModuleId}`;

/** Split static GLSL out of MapLibre's precompiled main module, keeping its production transforms. */
export function mapLibreShaderChunks(): Plugin {
  let shaderModule = '';
  return {
    name: 'maplibre-shader-chunks',
    apply: 'build',
    resolveId(id) {
      return id === shaderModuleId ? resolvedShaderModuleId : null;
    },
    load(id) {
      return id === resolvedShaderModuleId ? shaderModule : null;
    },
    transform(code, id) {
      if (!id.replaceAll('\\', '/').endsWith('/node_modules/maplibre-gl/dist/maplibre-gl.mjs')) return null;
      const output = new MagicString(code);
      const imports: string[] = [];
      const declarations: string[] = [];
      let prefix = '__mtMapLibreShader';
      while (code.includes(prefix)) prefix += '_';

      function visit(value: unknown) {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) { value.forEach(visit); return; }
        const node = value as Record<string, unknown>;
        // Tagged templates use their raw spelling; interpolated templates depend on scope.
        if (node.type === 'TaggedTemplateExpression') return;
        if (node.type === 'TemplateLiteral' && Array.isArray(node.expressions) && !node.expressions.length
          && typeof node.start === 'number' && typeof node.end === 'number' && node.end - node.start >= 1024) {
          const literal = code.slice(node.start, node.end);
          if (/\buniform\b|\bgl_Position\b|#(?:define|ifdef)/u.test(literal)) {
            const name = `shader_${declarations.length}`;
            const binding = `${prefix}_${declarations.length}`;
            imports.push(`${name} as ${binding}`);
            declarations.push(`export const ${name} = ${literal};`);
            output.overwrite(node.start, node.end, binding);
            return;
          }
        }
        Object.values(node).forEach(visit);
      }

      visit(this.parse(code));
      if (!declarations.length) return null;
      // Carry the upstream license notice into the virtual module as well.
      const license = code.match(/^\/\*\*[\s\S]*?@license[\s\S]*?\*\//u)?.[0] || '';
      shaderModule = `${license}\n${declarations.join('\n')}\n`;
      output.prepend(`import { ${imports.join(', ')} } from '${shaderModuleId}';\n`);
      return { code: output.toString(), map: output.generateMap({ hires: true, source: id, includeContent: true }) };
    }
  };
}
