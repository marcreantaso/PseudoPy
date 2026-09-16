"use strict";
importScripts("./vendor/skulpt.min.js", "./vendor/skulpt-stdlib.js");
self.onmessage = async ({ data }) => {
  let output = "",
    index = 0;
  const inputs = data.input || [];
  Sk.configure({
    output: (text) => {
      output += text;
      if (output.length > 50000) throw Error("Output limit exceeded.");
    },
    read: (name) => {
      if (name === "src/builtin/sys.js") return Sk.builtinFiles.files[name];
      throw Error("Imports and file access are disabled.");
    },
    inputfun: () => {
      if (index >= inputs.length)
        throw Error("Input exhausted. Provide one value per INPUT statement.");
      return Promise.resolve(inputs[index++]);
    },
    inputfunTakesPrompt: true,
    __future__: Sk.python3,
    execLimit: 4000,
    yieldLimit: 100,
  });
  try {
    await Sk.misceval.asyncToPromise(() =>
      Sk.importMainWithBody("<stdin>", false, data.code, true),
    );
    self.postMessage({ success: true, output });
  } catch (e) {
    self.postMessage({ success: false, output: output + "\n" + String(e) });
  }
};
