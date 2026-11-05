export function pdfDocument(objects) {
  let text='%PDF-1.4\n'
  const offsets=new Map()
  for(const [num,body] of objects){offsets.set(num,Buffer.byteLength(text,'latin1'));text+=`${num} 0 obj\n${body}\nendobj\n`}
  const start=Buffer.byteLength(text,'latin1'),size=Math.max(...offsets.keys())+1
  text+=`xref\n0 ${size}\n0000000000 65535 f \n`
  for(let i=1;i<size;i++)text+=offsets.has(i)?`${String(offsets.get(i)).padStart(10,'0')} 00000 n \n`:'0000000000 00000 f \n'
  return Buffer.from(text+`trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`,'latin1')
}
export const stream=(content,filters='')=>`<< /Length ${Buffer.byteLength(content,'latin1')} ${filters} >>\nstream\n${content}\nendstream`
export const page=(content)=>`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 5 0 R >> >> /Contents ${content} 0 R >>`
export const twoPages=()=>new Map([[1,'<< /Type /Catalog /Pages 2 0 R >>'],[2,'<< /Type /Pages /Count 2 /Kids [10 0 R 3 0 R] >>'],
  [3,page(4)],[4,stream('BT /F1 12 Tf (SECOND) Tj ET')],[5,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'],
  [10,page(11)],[11,stream('BT /F1 12 Tf (FIRST) Tj ET')]])
