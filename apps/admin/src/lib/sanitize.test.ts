import { describe, expect, it } from 'vitest';
import { sanitizeHtml } from './sanitize';

describe('sanitizeHtml — funcionalidade preservada', () => {
  it('mantém marcação de ajuda intocada', () => {
    const html =
      '<h4>Título</h4><p>Texto com <strong>negrito</strong> e <em>ênfase</em>.</p><ul><li>um</li><li>dois</li></ul>';
    expect(sanitizeHtml(html)).toBe(html);
  });

  it('mantém link externo e força rel seguro em target=_blank', () => {
    expect(sanitizeHtml('<a href="https://example.com" target="_blank">doc</a>')).toBe(
      '<a href="https://example.com" target="_blank" rel="noopener noreferrer">doc</a>',
    );
    expect(sanitizeHtml('<a href="#topo">topo</a>')).toBe('<a href="#topo">topo</a>');
    expect(sanitizeHtml('<a href="/admin/ajuda">interno</a>')).toBe('<a href="/admin/ajuda">interno</a>');
    expect(sanitizeHtml('<a href="mailto:x@y.z">mail</a>')).toBe('<a href="mailto:x@y.z">mail</a>');
  });

  it('mantém imagem com src seguro e class', () => {
    expect(sanitizeHtml('<img src="/img/logo.png" alt="logo" class="w-full">')).toBe(
      '<img src="/img/logo.png" alt="logo" class="w-full" />',
    );
  });

  it('preserva entidades de texto já válidas', () => {
    expect(sanitizeHtml('<p>a &amp; b &lt; c</p>')).toBe('<p>a &amp; b &lt; c</p>');
  });

  it('é idempotente', () => {
    const html = '<div class="x"><h4>t</h4><p><a href="https://a.b">l</a></p></div>';
    expect(sanitizeHtml(sanitizeHtml(html))).toBe(sanitizeHtml(html));
  });

  it('remove comentário e doctype', () => {
    expect(sanitizeHtml('<!-- x --><p>ok</p>')).toBe('<p>ok</p>');
    expect(sanitizeHtml('<!DOCTYPE html><p>ok</p>')).toBe('<p>ok</p>');
  });

  it('aceita entradas não-string sem lançar', () => {
    expect(sanitizeHtml(undefined)).toBe('');
    expect(sanitizeHtml(null)).toBe('');
    expect(sanitizeHtml(42 as unknown)).toBe('');
  });
});

describe('sanitizeHtml — vetores XSS', () => {
  it('remove <script> com conteúdo', () => {
    expect(sanitizeHtml('<script>alert(1)</script>')).toBe('');
    expect(sanitizeHtml('<p>a</p><SCRIPT>alert(1)</SCRIPT><p>b</p>')).toBe('<p>a</p><p>b</p>');
  });

  it('remove <style>, <svg>, <iframe> e conteúdo bruto', () => {
    expect(sanitizeHtml('<style>body{background:url(javascript:1)}</style>')).toBe('');
    expect(sanitizeHtml('<svg><script>alert(1)</script></svg>')).toBe('');
    expect(sanitizeHtml('<iframe src="https://evil"></iframe>')).toBe('');
    expect(sanitizeHtml('<math><mtext>x</mtext></math>')).toBe('');
  });

  it('remove handlers de evento e style', () => {
    expect(sanitizeHtml('<div onclick="alert(1)" style="position:fixed">x</div>')).toBe('<div>x</div>');
    expect(sanitizeHtml('<img src="x" onerror="alert(1)">')).toBe('<img src="x" />');
    expect(sanitizeHtml('<a href="/a" ONMOUSEOVER="alert(1)">x</a>')).toBe('<a href="/a">x</a>');
  });

  it('bloqueia javascript: direto e por entidade', () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="JaVaScRiPt:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="&#106;avascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="&#x6a;avascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="javascript&colon;alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="javascript&#58;alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="java\tscript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href=" javascript:alert(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="vbscript:msgbox(1)">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>')).toBe('<a>x</a>');
    expect(sanitizeHtml('<img src="javascript:alert(1)">')).toBe('<img />');
  });

  it('bloqueia fechamento indevido (breakout do container)', () => {
    expect(sanitizeHtml('</div></div><script>alert(1)</script>')).toBe('');
    expect(sanitizeHtml('<b>a</b></b></b><img src=x onerror=alert(1)>')).toBe('<b>a</b><img src="x" />');
  });

  it('trata < malformado como texto', () => {
    expect(sanitizeHtml('a <3 b')).toBe('a &lt;3 b');
    // '<' solto vira texto; o restante é <script> com conteúdo descartado
    expect(sanitizeHtml('<<script>alert(1)</script>')).toBe('&lt;');
  });

  it('remove formulários e embeds', () => {
    expect(sanitizeHtml('<form action="https://evil"><input name="p"></form>ok')).toBe('ok');
    expect(sanitizeHtml('<object data="x.swf"></object>')).toBe('');
    expect(sanitizeHtml('<embed src="x">')).toBe('');
  });

  it('remove atributos desconhecidos mesmo em tags permitidas', () => {
    expect(sanitizeHtml('<span id="x" data-foo="1" class="ok">t</span>')).toBe('<span class="ok">t</span>');
  });

  it('descarta tag sem fechamento de ">" (malformada) sem emitir resto perigoso', () => {
    // o navegador também consome "<p" como parte da tag <a; nosso parse acompanha
    const out = sanitizeHtml('<a href="/ok" onclick=alert(1)<p>ok');
    expect(out).toBe('<a href="/ok">ok</a>');
    expect(out).not.toContain('onclick');
  });
});
