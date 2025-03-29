const print = (params: (0 | 1)[]) => {
  const es = ["", "E"];
  for (let i = 0; i < params.length; i++)
    es[i + 2] = params[i] === 0 ? `Exclude<${es[i + 1]}, E${i + 1}In> | E${i + 2}Out` : `E${i + 2}`;

  let result = "pipe<";
  for (let i = 0; i < params.length; i++) {
    if (!result.endsWith("<")) result += ", ";
    result +=
      params[i] === 0 ?
        `E${i + 1}In extends Effect, E${i + 2}Out extends Effect`
      : `E${i + 2} extends Effect`;
    result += `, R${i + 2}`;
  }
  result += ">(";
  for (let i = 0; i < params.length; i++) {
    if (!result.endsWith("(")) result += ", ";
    result += `${String.fromCharCode("a".charCodeAt(0) + i)}: (self: `;
    result +=
      params[i] === 0 ?
        `EffectedDraft<never, never, R${i === 0 ? "" : i + 1}>) => EffectedDraft<E${i + 1}In, E${i + 2}Out, R${i + 2}>`
      : `Effected<${es[i + 1]}, R${i === 0 ? "" : i + 1}>) => Effected<E${i + 2}, R${i + 2}>`;
  }
  result += `): Effected<${es[es.length - 1]}, R${params.length + 1}>;`;
  return result;
};

const allParams = (length: number) => {
  const result: (0 | 1)[][] = [];
  const add = (params: (0 | 1)[], index: number) => {
    if (index === length) {
      result.push(params);
      return;
    }
    add([...params, 0], index + 1);
    add([...params, 1], index + 1);
  };
  add([], 0);
  return result;
};

const printAll = (length: number) => {
  let result = "";
  for (const params of allParams(length)) {
    if (result) result += "\n";
    result += "// prettier-ignore\n";
    result += print(params);
  }
  return result;
};

for (let i = 1; i <= 8; i++) {
  console.log(`// * ${i}`);
  console.log(printAll(i));
}

export {};
