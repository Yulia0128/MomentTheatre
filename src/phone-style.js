import { USER_AVATAR, CHAR_AVATAR } from './avatar-data.js';
// Shared by the sandboxed reader, theme preview, and exported reading files.
export const PHONE_CSS = `
html{color-scheme:light}
body.phone-reader,.phone-chapter{background:transparent!important}
.phone{--user-avatar:url("${USER_AVATAR}");--char-avatar:url("${CHAR_AVATAR}");--avatar-size:32px;--message-gap:8px}
.message{flex-direction:row;align-items:flex-start;gap:var(--message-gap);margin:18px 0}.message.own{flex-direction:row-reverse;align-items:flex-start}
.message-avatar{display:block;width:var(--avatar-size);height:var(--avatar-size);flex:0 0 var(--avatar-size);border-radius:50%;background:#8882 var(--char-avatar) center/cover no-repeat}.own .message-avatar{background-image:var(--user-avatar)}
.message-content{max-width:calc(100% - 2 * (var(--avatar-size) + var(--message-gap)));min-width:0;display:flex;flex-direction:column;align-items:flex-start}.own .message-content{align-items:flex-end}.bubble{max-width:100%;min-width:0}
.message-time{display:block;font:10px/1.5 system-ui,sans-serif;opacity:.45;margin-top:4px}
.phone svg{display:block;width:22px;height:22px;flex-shrink:0}
.phone-contact{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.phone-battery{display:flex;align-items:center;height:18px}
.phone-battery i{display:block;width:19px;height:10px;border:1px solid currentColor;border-radius:3px;position:relative}
.phone-battery i:before{content:'';position:absolute;inset:2px;background:currentColor;border-radius:1px}
.phone-battery i:after{content:'';position:absolute;right:-3px;top:2px;width:2px;height:4px;background:currentColor;border-radius:1px;opacity:.5}
.phone-footer>svg{width:24px;height:24px;opacity:.65}
.message[data-type=voice] .bubble{min-width:0;width:190px;padding:0}
.voice>summary{list-style:none;display:flex;align-items:center;gap:10px;padding:10px 12px;font-size:12px}
.voice>summary::-webkit-details-marker{display:none}
.voice-wave{display:flex;align-items:center;gap:3px;height:18px}
.voice-wave i{display:block;background:currentColor;width:2px;height:6px;border-radius:2px}
.voice-wave i:nth-child(2){height:12px}.voice-wave i:nth-child(3){height:18px}.voice-wave i:nth-child(4){height:10px}
.voice-hint{margin-left:auto;opacity:.55;font-size:10px;white-space:nowrap}
.voice-open{display:none}.voice[open] .voice-open{display:inline}.voice[open] .voice-closed{display:none}
.voice-transcript{padding:10px 12px;border-top:1px solid #8883;font-size:13px;white-space:pre-wrap}
.message:is([data-type=transfer],[data-type=image],[data-type=sticker],[data-type=location],[data-type=share]) .bubble{padding:0;border:0;background:transparent;border-radius:10px;overflow:hidden}
.transfer-card{width:218px;max-width:100%;background:#e99b54;color:#fff;border-radius:9px;white-space:normal}
.transfer-main{display:flex;gap:12px;align-items:center;padding:15px 14px 10px}
.transfer-main>div{min-width:0}
.transfer-main>svg{width:32px;height:32px}.transfer-main strong{display:block;font:500 21px/1.4 system-ui,sans-serif}
.transfer-main span{font-size:11px;opacity:.85;display:block;margin-top:2px}
.bubble .transfer-note{margin:0;padding:0 14px 9px;font-size:11px;opacity:.9}
.transfer-foot{border-top:1px solid #fff4;font-size:10px;padding:4px 14px;opacity:.85}
.image-description{min-height:118px;width:204px;max-width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:var(--bubble);border:1px solid #8882;border-radius:9px;padding:18px 14px;text-align:center}
.image-description>svg{width:26px;height:26px;opacity:.4}.image-description>span{font-size:12px;opacity:.7;white-space:pre-wrap}
.bubble .message-image{max-height:260px;object-fit:contain;border-radius:9px}
.bubble .sticker-image{max-height:132px;max-width:min(132px,100%);object-fit:contain}
.sticker-built-in{max-width:132px;min-width:72px}.sticker-built-in>svg{width:116px;height:116px;max-width:100%}
.sticker-fallback{display:block;padding:12px 6px;font-size:17px}
.location-card,.share-card{width:222px;max-width:100%;background:var(--bubble);border:1px solid #8882;border-radius:9px;overflow:hidden;white-space:normal}
.location-caption{padding:10px 12px 8px}.location-caption strong{display:block;font-size:13px;font-weight:500;line-height:1.6}
.message .location-caption small{display:block;white-space:nowrap;text-overflow:ellipsis;overflow:hidden;margin:3px 0 0;opacity:.5;font-size:10px}
.location-card>svg{width:100%;height:92px;object-fit:cover}
.share-card{padding:12px 12px 0}.share-card>strong{display:block;font-size:14px;font-weight:500;line-height:1.65}
.share-description{display:flex;align-items:center;gap:10px;margin:10px 0;font-size:11px;opacity:.7;line-height:1.6}
.share-description>span:first-child{flex:1;min-width:0}.share-description>img,.share-thumbnail{width:44px;height:44px;object-fit:cover;flex-shrink:0;border-radius:5px}
.share-thumbnail{display:grid;place-items:center;background:#8881}.share-source{display:flex;align-items:center;gap:5px;border-top:1px solid #8882;padding:6px 0;font-size:10px;opacity:.6}
.share-source>svg{width:13px;height:13px}.call-record{display:flex;align-items:center;gap:8px;font-size:13px}.call-record>svg{width:18px;height:18px}
.retracted-message{display:flex;flex-direction:column;gap:6px;font:inherit}.retract-notice{font:inherit;opacity:.55}.retract-original{font:inherit;white-space:pre-wrap}
@media(max-width:300px){.transfer-main{gap:7px;padding:12px 10px 8px}.transfer-main>svg{width:24px;height:24px}.transfer-main strong{font-size:16px}.share-description{gap:6px}.share-description>img,.share-thumbnail{width:32px;height:32px}}
`;
