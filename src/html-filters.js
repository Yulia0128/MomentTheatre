import { normalizeRegexRules, compileRuleRegex } from './preset-regex.js';

export const htmlFilterRules = rules => normalizeRegexRules(rules).filter(rule => !rule.disabled && !rule.replaceString.trim());
const overlap = (a,b) => a.start < b.end && a.end > b.start;
function erase(text, cuts, start=0, end=text.length) {
  let result='',cursor=start;
  for(const cut of [...cuts].sort((a,b)=>a.start-b.start||b.end-a.end)) {
    if(cut.end<=cursor||cut.start>=end)continue;
    result+=text.slice(cursor,Math.max(cursor,cut.start));cursor=Math.min(end,Math.max(cursor,cut.end));
  }
  return result+text.slice(cursor,end);
}
// Keep offsets into the original document. Do not serialize a DOM: it can rewrite
// scripts, templates, attribute quoting and deliberately authored page markup.
function scan(text) {
  const tags=/<!--[\s\S]*?(?:-->|$)|<![^>]*>|<\/?([a-z][a-z0-9:-]*)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;
  const stack=[],nodes=[],protectedRanges=[],tokens=[];let bodyEnd=Infinity,scripts='';
  for(let match;(match=tags.exec(text));){
    const start=match.index,end=tags.lastIndex,name=match[1]?.toLowerCase(),closing=match[0].startsWith('</');
    if(!name){protectedRanges.push({start,end});continue;}
    tokens.push({start,end});
    if(['html','head','body'].includes(name))protectedRanges.push({start,end});
    if(name==='body'&&closing)bodyEnd=start;
    if(!closing&&['script','style','textarea','title','xmp','template'].includes(name)){
      const close=new RegExp('</'+name+'\\s*>','gi');close.lastIndex=end;
      const stop=close.exec(text);tags.lastIndex=stop?close.lastIndex:text.length;
      protectedRanges.push({start,end:tags.lastIndex});
      if(name==='script')scripts+=text.slice(end,stop?.index??text.length)+'\n';
      continue;
    }
    if(closing){
      const index=stack.findLastIndex(node=>node.name===name);
      if(index>=0){const node=stack[index];node.innerEnd=start;node.end=end;nodes.push(node);stack.splice(index);}
    }else if(!/\/\s*>$/.test(match[0])&&!['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr'].includes(name)){
      stack.push({name,start,innerStart:end,tag:match[0]});
    }
  }
  return {nodes,protectedRanges,tokens,bodyEnd,scripts};
}
function removable(node,scripts) {
  if(!['div','aside','footer','section','p','span'].includes(node.name))return false;
  if(/\s(?:id|role|tabindex|contenteditable|on[a-z]+)\s*(?:=|>)/i.test(node.tag))return false;
  const classes=node.tag.match(/\sclass\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  return !(classes?.slice(1).find(Boolean)||'').split(/\s+/).filter(Boolean).some(name=>scripts.includes(name));
}
function removeEmptyShells(text,cuts,tree) {
  for(const node of tree.nodes) {
    if(!removable(node,tree.scripts)||cuts.some(cut=>cut.start<=node.start&&cut.end>=node.end))continue;
    const affected=cuts.some(cut=>cut.start>=node.innerStart&&cut.end<=node.innerEnd);
    // Legacy manually-moved tail: this exact inert empty marker sits outside body.
    const oldMarker=node.start>tree.bodyEnd&&node.name==='div'&&/\sclass\s*=\s*(?:"marker"|'marker'|marker(?=[\s>]))/i.test(node.tag);
    if((affected||oldMarker)&&!erase(text,cuts,node.innerStart,node.innerEnd).trim())cuts.push({start:node.start,end:node.end});
  }
  return erase(text,cuts);
}
export function filterHtmlDocument(document,rules=[],snapshot={}) {
  let content=String(document??'');const warnings=[];
  for(const rule of htmlFilterRules(rules)) {
    try {
      const tree=scan(content),cuts=[];
      content.replace(compileRuleRegex(rule,snapshot),(...args)=>{
        const offset=args.at(typeof args.at(-1)==='object'?-3:-2),cut={start:offset,end:offset+args[0].length};
        if(!args[0]||tree.protectedRanges.some(range=>overlap(cut,range)))return args[0];
        // Never remove a partial tag or an attribute value, even for a broad rule.
        if(tree.tokens.some(range=>overlap(cut,range)&&(cut.start>range.start||cut.end<range.end)))return args[0];
        cuts.push(cut);return args[0];
      });
      content=removeEmptyShells(content,cuts,tree);
    } catch(error){warnings.push('正则「'+rule.scriptName+'」未应用：'+error.message);}
  }
  content=removeEmptyShells(content,[],scan(content));
  return {content,warnings};
}
