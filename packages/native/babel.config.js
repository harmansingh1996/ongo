module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          root: ['./'],
          alias: {
            '~': './src',
            '@/types': './src/types/index',
            '@/lib': './src/lib',
            '@/config': './src/config',
            '@/components': './src/components',
            '@/hooks': './src/hooks',
          },
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
        },
      ],
    ],
  };
};
