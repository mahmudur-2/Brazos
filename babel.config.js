module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module:react-native-dotenv',
        {
          // Import env vars with: import { SUPABASE_URL } from '@env'
          moduleName: '@env',
          path: '.env',
          safe: false,
          // Let lib/supabase.ts surface a friendly runtime error if .env is missing,
          // rather than failing the bundle build.
          allowUndefined: true,
        },
      ],
      // Must stay LAST: the worklets/reanimated plugin has to run after every
      // other transform so it sees the final shape of each worklet body.
      'react-native-reanimated/plugin',
    ],
  };
};
