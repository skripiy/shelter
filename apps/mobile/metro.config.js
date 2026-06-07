// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// @supabase/supabase-js опціонально робить `import("@opentelemetry/api")`,
// загорнутий у .catch(() => null). Цей пакет не встановлено, а Metro не
// поважає webpackIgnore-коментарі й падає на статичному резолві. Підмінюємо
// його порожнім модулем — рантайм supabase коректно це обробляє.
const originalResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === '@opentelemetry/api') {
    return { type: 'empty' };
  }
  return (originalResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
