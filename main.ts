import{readdirSync as a,readFileSync as b,mkdirSync as c,writeFileSync as d}from"node:fs";
import{join as e}from"node:path";
const I=process.env.MAKEFUN_INPUT_DIR||"/input",O=process.env.MAKEFUN_OUTPUT_DIR||"/output",X=[0,0,-1,1],Y=[-1,1,0,0],J=a=>a.sort((x,y)=>x-y);
function P(t){let r=t.split("\n").filter(s=>s),h=r.length,w=Math.max(...r.map(s=>s.length)),A=new Uint8Array(w*h).fill(1),G=[],B=[],p=-1;
r.forEach((s,y)=>{for(let x=0;x<w;x++){let k=s[x]||"#",i=y*w+x;if(k=="#")continue;A[i]=0;if(k=="."||k=="*"||k=="+")G.push(i);if(k=="$"||k=="*")B.push(i);if(k=="@"||k=="+")p=i}});
return{w,h,A,G,B:J(B),p}}
function Q(w,F,s){let d=new Int32Array(F.length).fill(-1),q=[s];d[s]=0;for(let i=0;i<q.length;i++)for(let k=0;k<4;k++){let n=q[i]+Y[k]*w+X[k];if(n>=0&&n<F.length&&F[n]&&d[n]<0){d[n]=d[q[i]]+1;q.push(n)}}return d}
function R(w,A,S,f){let v=new Int32Array(A.length).fill(-2),q=[f];v[f]=-1;for(let i=0;i<q.length;i++)for(let k=0;k<4;k++){let n=q[i]+Y[k]*w+X[k];if(n>=0&&n<A.length&&!A[n]&&!S.has(n)&&v[n]==-2){v[n]=q[i];q.push(n)}}return v}
function K(v,w,f,t){let m="";for(let j=t;j!=f;j=v[j]){let z=j-v[j];m=(z==1?"r":z==-1?"l":z==w?"d":"u")+m}return m}
function D(w,F,G){let V=new Uint8Array(F.length),q=[...G];for(let g of G)V[g]=1;for(let i=0;i<q.length;i++)for(let k=0;k<4;k++){let o=Y[k]*w+X[k],p=q[i]-o,s=q[i]-2*o;if(p>=0&&p<F.length&&s>=0&&s<F.length&&F[p]&&F[s]&&!V[p]){V[p]=1;q.push(p)}}return F.map((v,i)=>v&&!V[i]?1:0)}
function S(w,A,F,C,G,B,p,M,U){let n=B.length;if(!n)return{m:"",p:0,f:p,b:[]};
let g=new Set(G),d=D(w,F,G),T=G.map(x=>Q(w,F,x));
for(let y of B)if(d[y]&&!g.has(y))return null;
let h=b=>{let m=1/0;const f=(i,u,s)=>{if(i==n){if(s<m)m=s;return}for(let j=0;j<n;j++)if(!(u>>j&1)&&T[j][b[i]]>=0)f(i+1,u|1<<j,s+T[j][b[i]])};f(0,0,0);return m};
let z=s=>{for(let y of s)for(let o of[0,-1,-w,-w-1]){let t=y+o;if(t>=0&&t%w<w-1&&t+w+1<A.length&&s.has(t)&&s.has(t+1)&&s.has(t+w)&&s.has(t+w+1)&&!(g.has(t)&&g.has(t+1)&&g.has(t+w)&&g.has(t+w+1)))return 1}return 0};
let k=(b,p)=>b+","+p,V=[B.slice()],E=[p],G2=[0],A2=[-1],N=[null],cl=new Map([[k(B,p),0]]),O2=[],q=0,e=0,h0=h(B);
if(h0==1/0)return null;
O2.push([h0*1e10+h0*1e7,0]);
while(O2.length){let bi=0;for(let i=1;i<O2.length;i++)if(O2[i][0]<O2[bi][0])bi=i;
let s=O2.splice(bi,1)[0][1];
if(cl.get(k(V[s],E[s]))!=s)continue;
let b=V[s],pl=E[s];
if(b.every(x=>g.has(x))){let ch=[];for(let t=s;t>0;t=A2[t])ch.push(t);ch.reverse();let m="",cp=p,cb=B;
for(let t of ch){let o=N[t],rv=R(w,A,new Set(cb),cp);if(rv[o.f]==-2)return null;m+=K(rv,w,cp,o.f)+o.l;cp=o.b;let nx=cb.slice();nx[nx.indexOf(o.b)]=o.b+o.d;J(nx);cb=nx}
return{m,p:G2[s],f:cp,b:cb}}
if(e>=M||U.u>=U.c)return null;e++;U.u++;
let bs=new Set(b),rg=R(w,A,bs,pl);
for(let i=0;i<n;i++)for(let j=0;j<4;j++){let dd=Y[j]*w+X[j],fr=b[i]-dd,tg=b[i]+dd;
if(rg[fr]==-2)continue;
if(tg<0||tg>=A.length||!F[tg]||!C[tg]||bs.has(tg))continue;
let nb=b.slice();nb[i]=tg;J(nb);
if(nb.some(x=>d[x]&&!g.has(x)))continue;
if(z(new Set(nb)))continue;
let hh=h(nb);if(hh==1/0)continue;
let kk=k(nb,b[i]),sv=cl.get(kk);
if(sv!==undefined&&G2[sv]<=G2[s]+1)continue;
let t=V.length;V.push(nb);E.push(b[i]);G2.push(G2[s]+1);A2.push(s);N.push({f:fr,b:b[i],d:dd,l:"udlr"[j]});cl.set(kk,t);O2.push([(G2[s]+1+hh)*1e10+hh*1e7+q++,t])}
}
return null}
function M(l){let{w,h,A,G,B,p}=l,H=(p/w)|0,I=i=>((i/w)|0)==H,H2=new Set(),v=new Uint8Array(w*h),R2=[];
for(let i=0;i<w*h;i++)if(I(i)&&!A[i])H2.add(i);
for(let s=0;s<w*h;s++){if(A[s]||I(s)||v[s])continue;let rv=R(w,A,H2,s),c=[];
for(let i=0;i<w*h;i++)if(rv[i]!=-2){v[i]=1;c.push(i)}
let S2=new Set(c),b=B.filter(x=>S2.has(x)),g=G.filter(x=>S2.has(x)),dr=-1,en=-1;
for(let x of c){for(let k=0;k<4;k++){let n=x+Y[k]*w+X[k];if(n>=0&&n<w*h&&I(n)&&!A[n]){dr=x;en=n;break}}if(dr>=0)break}
R2.push({c:S2,b,g,dr,en})}
return R2}
function Z(t,U){let l=P(t),{w,A,G,B,p}=l;if(!B.length)return"";let Q=M(l);
let ok=Q.length&&Q.every(r=>r.dr>=0&&r.en>=0&&r.b.length==r.g.length&&r.b.length)&&Q.reduce((x,r)=>x+r.b.length,0)==B.length;
if(!ok){let F=A.map(v=>1-v),s=S(w,A,F,F,G,B,p,2e6,U);return s?s.m:""}
Q.sort((x,y)=>x.en-y.en);let m="",cp=p,cb=B.slice();
for(let r of Q){let rv=R(w,A,new Set(cb),cp);if(rv[r.en]==-2)return"";m+=K(rv,w,cp,r.en);cp=r.en;
let F=new Uint8Array(A.length),C=new Uint8Array(A.length);for(let x of r.c)F[x]=C[x]=1;F[r.en]=1;
let s=S(w,A,F,C,r.g,r.b,r.en,4e5,U);
if(!s&&U.u<U.c)s=S(w,A,F,C,r.g,r.b,r.en,15e5,U);
if(!s)return"";m+=s.m;cp=s.f;
let mp=new Map(r.b.map((y,i)=>[y,s.b[i]]));for(let i=0;i<cb.length;i++)if(mp.has(cb[i]))cb[i]=mp.get(cb[i])}
return m}
let U={u:0,c:5e6};
for(let id of a(I).sort()){let m=Z(b(e(I,id,"level.txt"),"utf8"),U);c(e(O,id),{recursive:true});d(e(O,id,"solution.txt"),m+"\n")}
