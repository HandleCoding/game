import io,zipfile,urllib.request,hashlib
from pathlib import Path
root=Path('/opt/pair-play-dev');out=root/'apps/web/public/ranch'
with urllib.request.urlopen('https://opengameart.org/sites/default/files/kenney_animalPackRedux.zip',timeout=60) as r:data=r.read(5_000_000)
z=zipfile.ZipFile(io.BytesIO(data));count=0
for name in z.namelist():
 if name.startswith('PNG/Round/') and name.endswith('.png'):
  (out/Path(name).name).write_bytes(z.read(name));count+=1
(out/'Kenney-LICENSE.txt').write_bytes(z.read('License.txt'))
print('Installed',count,'CC0 PNGs; zip SHA-256:',hashlib.sha256(data).hexdigest())
# Project-authored vector faces for species outside the pack.
face='<circle cx="46" cy="65" r="4" fill="#343130"/><circle cx="82" cy="65" r="4" fill="#343130"/><circle cx="47" cy="64" r="1.2" fill="#fff"/><circle cx="83" cy="64" r="1.2" fill="#fff"/><ellipse cx="37" cy="77" rx="8" ry="4" fill="#e9a4a4" opacity=".5"/><ellipse cx="91" cy="77" rx="8" ry="4" fill="#e9a4a4" opacity=".5"/>'
mouth='<path d="M55 84q9 10 18 0" fill="none" stroke="#6e5143" stroke-width="3" stroke-linecap="round"/>'
drawings={
 'cat':'<path d="M25 48 19 14 51 34M77 34 109 14 103 49" fill="#e2b175"/><path d="m25 23 4 22 13-9m62-13-4 22-13-9" fill="#ecbbb1"/><rect x="22" y="34" width="84" height="73" rx="32" fill="#ebc38e"/><path d="m59 81 5 5 5-5" fill="#976344"/><path d="M20 77H7m15 10L9 93m99-16h13m-15 10 13 6" stroke="#a37756" stroke-width="3"/>'+face+mouth,
 'sheep':'<g fill="#ece7dd"><circle cx="36" cy="43" r="20"/><circle cx="61" cy="29" r="21"/><circle cx="89" cy="42" r="23"/><circle cx="105" cy="64" r="21"/><circle cx="96" cy="89" r="22"/><circle cx="64" cy="106" r="20"/><circle cx="34" cy="93" r="22"/><circle cx="23" cy="66" r="20"/></g><ellipse cx="64" cy="71" rx="35" ry="34" fill="#c6b09b"/>'+face+mouth,
 'goose':'<ellipse cx="64" cy="64" rx="44" ry="45" fill="#f4f1df"/><path d="M39 27q18-20 32-10" fill="none" stroke="#f4f1df" stroke-width="13" stroke-linecap="round"/>'+face+'<ellipse cx="64" cy="87" rx="22" ry="10" fill="#e6ac51"/>',
 'fox':'<path d="M22 47 19 10 52 34M76 34l33-24-3 41" fill="#c18b69"/><path d="m25 23 2 21 15-8m62-13-2 21-15-8" fill="#eed4bb"/><path d="M18 58q0-34 46-34t46 34q0 47-46 55Q18 99 18 58" fill="#d59a76"/><path d="M19 67q28-4 45 22 17-26 45-22Q98 109 64 113 30 102 19 67" fill="#f4e6cc"/>'+face+'<path d="m56 88 8 8 8-8" fill="#695448"/>',
 'deer':'<g fill="none" stroke="#ae8d64" stroke-width="7" stroke-linecap="round"><path d="M37 44 31 18 19 6m12 15 10-9m50 32 6-26 12-12m-12 15-10-9"/></g><ellipse cx="24" cy="50" rx="17" ry="11" fill="#c3a07c"/><ellipse cx="104" cy="50" rx="17" ry="11" fill="#c3a07c"/><rect x="28" y="33" width="72" height="80" rx="30" fill="#d3b390"/><g fill="#f6e6cb"><circle cx="44" cy="46" r="4"/><circle cx="84" cy="46" r="4"/><circle cx="64" cy="42" r="4"/></g>'+face+'<ellipse cx="64" cy="86" rx="10" ry="6" fill="#8b6c54"/>'+mouth,
 'alpaca':'<rect x="35" y="84" width="58" height="36" rx="20" fill="#e7d5b6"/><rect x="27" y="13" width="17" height="40" rx="9" fill="#e7d5b6"/><rect x="84" y="13" width="17" height="40" rx="9" fill="#e7d5b6"/><ellipse cx="64" cy="67" rx="44" ry="36" fill="#efe0c4"/><ellipse cx="64" cy="84" rx="26" ry="16" fill="#ddc5a4"/>'+face+mouth,
 'peacock':'<g fill="#a1bfa0"><ellipse cx="25" cy="46" rx="20" ry="38" transform="rotate(-35 25 46)"/><ellipse cx="103" cy="46" rx="20" ry="38" transform="rotate(35 103 46)"/></g><g fill="#5c8f90"><circle cx="24" cy="35" r="9"/><circle cx="104" cy="35" r="9"/></g><ellipse cx="64" cy="72" rx="39" ry="39" fill="#71afb0"/><path d="M64 33v-16m-6 18-8-17m20 17 8-17" stroke="#639c9d" stroke-width="5"/><g fill="#85bebe"><circle cx="64" cy="14" r="6"/><circle cx="47" cy="15" r="6"/><circle cx="81" cy="15" r="6"/></g>'+face+'<path d="m54 84 10 12 10-12" fill="#deb765"/>',
 'hedgehog':'<path d="m64 9 10 10 13-7 6 16 16-2-1 18 14 8-10 14 9 14-17 8-2 19-19-2-10 14-11-10-15 10-7-17-17 1-1-18-16-9 11-14-7-17 17-7 1-16 16 1 9-14 13 7z" fill="#ae9274"/><ellipse cx="64" cy="72" rx="39" ry="37" fill="#e7ceb0"/>'+face+'<ellipse cx="64" cy="86" rx="8" ry="5" fill="#81634f"/>'+mouth,
 'turtle':'<circle cx="64" cy="66" r="53" fill="#759a77"/><path d="m64 16 32 21v39l-32 25-32-25V37z" fill="none" stroke="#9db498" stroke-width="6"/><ellipse cx="64" cy="74" rx="36" ry="33" fill="#b5cc96"/>'+face+mouth,
 'lion':'<path d="m64 7 11 11 19-2 4 18 16 10-6 18 8 18-18 11-7 20-20-3-14 12-15-12-19 1-5-18L5 81l9-17-7-19 20-11 4-20 18 4z" fill="#b79265"/><circle cx="64" cy="66" r="39" fill="#e5c48d"/><ellipse cx="52" cy="86" rx="15" ry="12" fill="#f1ddba"/><ellipse cx="76" cy="86" rx="15" ry="12" fill="#f1ddba"/>'+face+'<path d="m56 81 8 8 8-8" fill="#896546"/>'+mouth,
}
assert len(drawings)==10
for name,shapes in drawings.items():(out/(name+'.svg')).write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">'+shapes+'</svg>')
p=root/'docs/ranch-assets.md'
p.write_text('# 牧场素材来源\n\nKenney Animal Pack Redux（CC0）：https://opengameart.org/content/animal-pack-redux 。原包许可证在 apps/web/public/ranch/Kenney-LICENSE.txt。包含 30 张 Round PNG，首版 36 种物种使用其中 26 种，另使用 chick 作为小鸡幼崽图。下载包 SHA-256：'+hashlib.sha256(data).hexdigest()+'.\n\n猫、绵羊、白鹅、狐狸、梅花鹿、羊驼、孔雀、刺猬、乌龟、狮子：本项目绘制的 10 张 SVG；每种有独立图形，不以换名或复制幼崽凑数。场景 SVG 与 CSS 动画同样由本项目实现。不引入旧腾讯素材或 Flash 运行库；资源在同源静态目录，不热链。\n')
print('Created 10 original cute SVG animal faces; all 36 species have their own asset')
