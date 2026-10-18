---
"@oktis-works/admin": minor
---

feat(admin): dropdowns em portal, sidebar sem seta separada e /settings/access com modal + matriz de permissões

Dropdowns imunes a overflow: novo `FloatingPanel` renderiza o painel num
portal no body com `position: fixed` (mede na abertura, abre para baixo ou
vira para cima, contido na viewport, reposiciona em scroll/resize, fecha
por clique fora/Escape). Os três cortes relatados deixam de existir:
- `IconPicker` em `/settings/post-types` (não estoura mais o form);
- `FieldTypePicker` em `/settings/custom-fields/[id]` e `/new` (dentro da
  área de drag & drop, que agora não o corta);
- `TimezoneSelect` em `/settings/general`.
O `FieldTypePicker` também passa a fechar no clique fora (antes não fechava).

Sidebar: o botão de seta separado para as taxonomias foi removido — a seta
agora é um caret decorativo DENTRO do link; clicar no link do content type
navega e abre o dropdown das taxonomias ao mesmo tempo. O link Settings faz
o mesmo com o submenu de configurações.

/settings/access:
- permissões do role deixam de ser texto livre e viram `PermissionPicker` —
  matriz de checkboxes recurso × ação (vocabulário real da API), com busca,
  contador e permissões personalizadas preservadas como chips removíveis;
- "+ Create" de Roles e Tenants sobe para o lado oposto do título
  (`card-header-row`);
- criar/editar roles e tenants abrem em modal genérico (`ui/Modal`) em vez
  de formulário no topo do card;
- tabela de Roles ganha coluna de resumo das permissões.

i18n: chaves novas em en/pt-BR (demais idiomas caem no fallback do en).
