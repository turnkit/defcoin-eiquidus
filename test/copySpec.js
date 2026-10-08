'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const lex = require('pug-lexer');
const pug = require('pug');

const root = path.resolve(__dirname, '..');

// These fingerprints were captured before the copy edit. Strip prose only;
// retain controls, attributes, links, interpolation, code and template structure.
function templateContract(name) {
  const source = fs.readFileSync(path.join(root, 'views', name + '.pug'), 'utf8');
  const tokens = lex(source).filter(function(token) {
    return token.type !== 'comment' && token.type !== 'comment-text';
  }).map(function(token) {
    const value = { ...token };
    delete value.loc;
    delete value.line;
    delete value.column;
    if (value.type === 'text')
      value.val = (value.val.match(/(?:#|!)\{[^}]*\}/g) || []).join('');
    if (value.type === 'code' && name === 'paperwallet')
      value.val = value.val.replace(/summary: '[^']*'/g, "summary: '<copy>'");
    return value;
  });
  return crypto.createHash('sha256').update(JSON.stringify(tokens)).digest('hex');
}

describe('public-page copy contracts', function() {
  const contracts = {
    faucet: 'dc9fef86be585d1b3b6037ffa44a01259294e001d24b0a6c0679440f6b086a02',
    mine: '561f88fa497c1f06a9a6cd7a30db2c65aa7a6f01e3105f48ff317c152387aa27',
    paperwallet: 'aa7d10c4521cd4ae77c899311f6a832bf15877a4512e78103cd8d8106d68c2a7',
    pool: '01fe903c5319a6b80b624841be07ee5348d882273667cfdadce3145b1ad26339',
    qr_generator: '1fcb365fa30dc0af32d53c45252c80ca2ee066312cd4728e0c0e9377aa3f03a9',
    reward_calculator: '448b4311c2d5c0cc9e95f19c10761114e1aa48b34ba6eb6f8c45c7af8e6b0c26',
    mining_stats: '23095552b658853ac100fea3f14922198ce68d37f25a0b176cdf84e3a52bb445',
    network: 'e27cb52f49fd4e32c3b06960c9207576987c509e89a1f7ac2db25cb3d918d14f'
  };

  Object.keys(contracts).forEach(function(name) {
    it('preserves the non-prose contract of ' + name, function() {
      expect(templateContract(name)).toEqual(contracts[name]);
    });
  });

  it('compiles every public Pug template', function() {
    fs.readdirSync(path.join(root, 'views')).filter(function(name) {
      return name.endsWith('.pug');
    }).forEach(function(name) {
      expect(function() {
        pug.compileFile(path.join(root, 'views', name));
      }).not.toThrow();
    });
  });

  it('retains private-key and offline-use warnings', function() {
    const source = fs.readFileSync(path.join(root, 'views/paperwallet.pug'), 'utf8');
    expect(source).toContain('Do not generate a paper wallet on a machine you do not trust.');
    expect(source).toContain('Anyone who gets the private key gets the coins.');
    expect(source).toContain('disconnect from the network');
  });
});
