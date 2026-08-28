module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo is the whole transform. It also adds the worklets
    // plugin itself when react-native-worklets is installed, so naming that
    // plugin by hand here would declare the same transform twice.
    //
    // THERE IS NO PLUGIN LIST ANY MORE. The dotenv plugin used to own one: it
    // created the virtual '@env' module that lib/supabase.ts imported. The app
    // now reads EXPO_PUBLIC_ variables through config/env.ts, which Metro and
    // the Expo CLI inline with no Babel plugin at all, so the package and its
    // entry are both gone. Do not bring either back — an '@env' import would
    // be a second, invisible configuration surface, and tests/motion120 reads
    // this file's RAW text to keep even a commented-out entry out of it.
    presets: ['babel-preset-expo'],
  };
};
