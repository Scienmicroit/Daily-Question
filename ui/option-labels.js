// optionOrder lists original keys in the order shown for this attempt.
export function displayKey(key, order) {
  const index = order?.indexOf(key) ?? -1
  return index < 0 ? key : String.fromCharCode(65 + index)
}

export function displayChoice(choice, order) {
  if (!order || !choice) return choice
  return [...choice].map((key) => displayKey(key, order)).sort().join('')
}

export function optionReferences(text, order) {
  if (!text || !order) return text
  if (/^[A-H]+$/.test(text.trim())) return displayChoice(text.trim(), order)
  const group = '[A-H]+(?:\\s*[、，,/和与及或]\\s*[A-H]+)*'
  const reference = new RegExp(
    '(?<prefix>选项|答案(?:为|是)?|应选|故选|选择|排除|不选|选|故|因此选|只有|只有选项|答案是|options?)\\s*[:：]?\\s*(' + group + ')(?![a-zA-Z])' +
    '|(?<![a-zA-Z0-9_])(' + group + ')(?=\\s*(?:选项|项|描述|说法|所述|中所|的说法|的表述|均|皆|正确|错误|不正确|不成立|成立|符合|不符合|是对的|是错的))' +
    '|^[ \\t]*(?:\\*\\*)?(' + group + ')(?=\\s*(?:[.。．、:：)）]|(?:\\*\\*)?\\s*$))', 'gmi')
  // Leave math, code and Markdown link destinations verbatim.
  const protectedParts = /(`{3}[\s\S]*?(?:`{3}|$)|~~~[\s\S]*?(?:~~~|$)|`+[^`\n]+`+|\$\$[\s\S]*?\$\$|\$[^$\n]+\$|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\]\([^)]+\))/g
  const spans = []
  const masked = text.replace(protectedParts, (span) => '\u0000' + (spans.push(span) - 1) + '\u0000')
  return masked.replace(reference,
    (match, prefix, after, before, heading) => {
      const keys = after || before || heading
      if (!keys || /[a-z]/.test(keys)) return match
      const at = after ? match.lastIndexOf(keys) : match.indexOf(keys)
      return match.slice(0, at) + keys.replace(/[A-H]/g, (key) => displayKey(key, order)) + match.slice(at + keys.length)
    }).replace(/\u0000(\d+)\u0000/g, (token, index) => spans[index] ?? token)
}
