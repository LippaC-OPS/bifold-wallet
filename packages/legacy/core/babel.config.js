const presets = ['module:metro-react-native-babel-preset']
const plugins = [
  'react-native-reanimated/plugin',
  [
    'module-resolver',
    {
      root: ['.'],
      extensions: ['.tsx', 'ts'],
    },
  ],
]

if (process.env['ENV'] === 'prod') {
  plugins.push('transform-remove-console')
}

module.exports = {
  presets,
  plugins,
}
