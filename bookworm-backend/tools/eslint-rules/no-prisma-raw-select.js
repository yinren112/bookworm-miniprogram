/**
 * Ban raw select/include anywhere inside Prisma call args (deep recursive).
 * Allowed:  select: Ident / MemberExpr (e.g. userRoleView or views.user.role)
 * Disallowed: ObjectExpression / ArrayExpression literals.
 */
export default {
  meta: {
    type: 'problem',
    docs: {
      description: 'ban raw select/include in Prisma calls (deep recursive), require view selectors from src/db/views/*',
      category: 'Best Practices',
      recommended: true,
    },
    schema: [],
    messages: {
      rawSelect: 'Use view selector from src/db/views/* instead of raw {{key}}. Example: select: userRoleView',
    },
  },
  create(ctx) {
    const METHODS = new Set([
      'findUnique',
      'findUniqueOrThrow',
      'findFirst',
      'findFirstOrThrow',
      'findMany',
      'create',
      'createMany',
      'update',
      'updateMany',
      'upsert',
      'delete',
      'deleteMany',
      'aggregate',
      'groupBy',
      'count',
    ]);

    function isPrismaCall(node) {
      return (
        node.callee?.type === 'MemberExpression' &&
        METHODS.has(node.callee.property?.name)
      );
    }

    function isAllowedValue(v) {
      return v.type === 'Identifier' || v.type === 'MemberExpression';
    }

    // Recursively visit all nested objects/arrays to find select/include
    function visitValue(v, reportNode) {
      if (!v) return;

      if (v.type === 'ObjectExpression') {
        for (const p of v.properties) {
          if (p.type !== 'Property') continue;

          const key = p.key?.name || p.key?.value;
          if (key === 'select' || key === 'include') {
            if (!isAllowedValue(p.value)) {
              ctx.report({
                node: p,
                messageId: 'rawSelect',
                data: { key },
              });
            }
          }

          // Recurse into nested objects/arrays (e.g., include: { bookMaster: { select: {...} } })
          if (p.value?.type === 'ObjectExpression') {
            visitValue(p.value, p);
          }
          if (p.value?.type === 'ArrayExpression') {
            for (const el of p.value.elements) {
              if (el) visitValue(el, p);
            }
          }
        }
      } else if (v.type === 'ArrayExpression') {
        for (const el of v.elements) {
          if (el) visitValue(el, reportNode);
        }
      }
    }

    return {
      CallExpression(node) {
        if (!isPrismaCall(node)) return;

        const [arg] = node.arguments || [];
        if (arg?.type === 'ObjectExpression') {
          visitValue(arg, arg);
        }
      },
    };
  },
};
