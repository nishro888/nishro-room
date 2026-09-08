# Nishro mic helper — list / choose / auto-pick / unmute recording devices.
#   powershell -File mic.ps1 -Action list             -> JSON array of mics
#   powershell -File mic.ps1 -Action default -Id ...   -> set default input
#   powershell -File mic.ps1 -Action auto              -> set default to best REAL mic
#   powershell -File mic.ps1 -Action unmute            -> unmute+raise default mic
# "auto" never picks a loopback device (Stereo Mix / What U Hear), which capture
# system sound, not your voice — that was why voice heard nothing.
param([string]$Action = "list", [string]$Id = "")
$ErrorActionPreference = "Stop"

Add-Type -Language CSharp @'
using System;using System.Runtime.InteropServices;using System.Text;
public class NishroAudio {
  [ComImport,Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class MMEnum {}
  [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IEnum {
    int EnumAudioEndpoints(int f,int s,out IColl c); int GetDefaultAudioEndpoint(int f,int r,out IDev d); int GetDevice(string id,out IDev d); }
  [Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IColl { int GetCount(out int c); int Item(int i,out IDev d); }
  [Guid("D666063F-1587-4E43-81F1-B948E807363F"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDev {
    int Activate(ref Guid iid,int ctx,IntPtr p,[MarshalAs(UnmanagedType.IUnknown)]out object o);
    int OpenPropertyStore(int a,out IProp ps); int GetId([MarshalAs(UnmanagedType.LPWStr)]out string id); int GetState(out int s); }
  [Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IProp { int GetCount(out int c); int GetAt(int i,out PKEY k); int GetValue(ref PKEY k,out PROPVAR v); }
  [StructLayout(LayoutKind.Sequential)] struct PKEY { public Guid fmtid; public int pid; }
  [StructLayout(LayoutKind.Explicit)] struct PROPVAR { [FieldOffset(0)] public short vt; [FieldOffset(8)] public IntPtr p; }
  [Guid("5CDF2C82-841E-4546-9722-0CF74078229A"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IVol {
    int a1(IntPtr n);int a2(IntPtr n);int a3(out int c);int a4(float d,ref Guid g);int SetScalar(float d,ref Guid g);
    int a6(out float d);int GetScalar(out float d);int a8(int i,float d,ref Guid g);int a9(int i,float d,ref Guid g);
    int a10(int i,out float d);int a11(int i,out float d);int SetMute(bool m,ref Guid g);int GetMute(out bool m); }
  [Guid("f8679f50-850a-41cf-9c72-430f290290c8"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IPolicy {
    [PreserveSig] int a1(string s,IntPtr p);[PreserveSig] int a2(string s,bool b,IntPtr p);[PreserveSig] int a3(string s);
    [PreserveSig] int a4(string s,IntPtr a,IntPtr b);[PreserveSig] int a5(string s,bool b,IntPtr a,IntPtr c);
    [PreserveSig] int a6(string s,IntPtr a);[PreserveSig] int a7(string s,IntPtr a);[PreserveSig] int a8(string s,IntPtr a);
    [PreserveSig] int a9(string s,bool b,IntPtr k,IntPtr v);[PreserveSig] int a10(string s,bool b,IntPtr k,IntPtr v);
    [PreserveSig] int SetDefaultEndpoint(string id,int role);[PreserveSig] int a12(string s,bool b); }
  [ComImport,Guid("870af99c-171d-4f9e-af0d-e63df40c2bc9")] class PolicyClient {}

  static PKEY NAME(){ var k=new PKEY(); k.fmtid=new Guid("a45c254e-df1c-4efd-8020-67d146a850e0"); k.pid=14; return k; }
  static string Esc(string s){ return s==null?"":s.Replace("\\","\\\\").Replace("\"","\\\""); }
  static bool IsLoopback(string n){ n=(n??"").ToLower(); return n.Contains("stereo mix")||n.Contains("what u hear")||n.Contains("wave out")||n.Contains("loopback")||n.Contains("rec. playback"); }
  static int Score(string n){ if(IsLoopback(n)) return -100; n=(n??"").ToLower();
    if(n.Contains("headset")||n.Contains("headphone")||n.Contains("earphone")||n.Contains("earpiece")||n.Contains("hands-free")||n.Contains("bluetooth")) return 30;
    if(n.Contains("usb")) return 20; if(n.Contains("microphone")||n.Contains("mic")) return 10; return 1; }

  static string GetName(IDev d){ var k=NAME(); IProp ps; d.OpenPropertyStore(0,out ps); PROPVAR pv; ps.GetValue(ref k,out pv); return pv.p!=IntPtr.Zero?Marshal.PtrToStringUni(pv.p):"?"; }
  static void UnmuteDev(IDev d){ try{ var iid=new Guid("5CDF2C82-841E-4546-9722-0CF74078229A"); object o; d.Activate(ref iid,1,IntPtr.Zero,out o); var v=(IVol)o; Guid g=Guid.Empty; v.SetMute(false,ref g); float lvl; v.GetScalar(out lvl); if(lvl<0.6f) v.SetScalar(0.85f,ref g);}catch{} }

  public static string List(){
    var en=(IEnum)(new MMEnum()); IColl col; en.EnumAudioEndpoints(1,15,out col); int n; col.GetCount(out n);
    string def=""; try{ IDev dd; en.GetDefaultAudioEndpoint(1,0,out dd); dd.GetId(out def);}catch{}
    var sb=new StringBuilder("["); bool first=true;
    for(int i=0;i<n;i++){ IDev d; col.Item(i,out d); string id; d.GetId(out id); int st; d.GetState(out st);
      if(st!=1) continue; string nm=GetName(d);
      bool mute=false; try{ var iid=new Guid("5CDF2C82-841E-4546-9722-0CF74078229A"); object o; d.Activate(ref iid,1,IntPtr.Zero,out o); ((IVol)o).GetMute(out mute);}catch{}
      if(!first) sb.Append(","); first=false;
      sb.Append("{\"id\":\""+Esc(id)+"\",\"name\":\""+Esc(nm)+"\",\"default\":"+(id==def?"true":"false")+",\"muted\":"+(mute?"true":"false")+",\"loopback\":"+(IsLoopback(nm)?"true":"false")+"}");
    }
    sb.Append("]"); return sb.ToString();
  }
  public static string SetDefault(string id){
    var pc=(IPolicy)(new PolicyClient()); pc.SetDefaultEndpoint(id,0); pc.SetDefaultEndpoint(id,1); pc.SetDefaultEndpoint(id,2);
    Unmute(); return "{\"ok\":true}";
  }
  // Pick the best REAL microphone (never loopback) and make it the default input.
  public static string Auto(){
    var en=(IEnum)(new MMEnum()); IColl col; en.EnumAudioEndpoints(1,15,out col); int n; col.GetCount(out n);
    string def=""; try{ IDev dd; en.GetDefaultAudioEndpoint(1,0,out dd); dd.GetId(out def);}catch{}
    string bestId=null,bestName=null; int bestScore=-1000;
    for(int i=0;i<n;i++){ IDev d; col.Item(i,out d); int st; d.GetState(out st); if(st!=1) continue;
      string id; d.GetId(out id); string nm=GetName(d); int sc=Score(nm);
      if(id==def) sc+=1; // tiny bias to keep the current one if it's already fine
      if(sc>bestScore){ bestScore=sc; bestId=id; bestName=nm; } }
    if(bestId==null||bestScore<0) return "{\"ok\":false,\"reason\":\"no real mic\"}";
    var pc=(IPolicy)(new PolicyClient()); pc.SetDefaultEndpoint(bestId,0); pc.SetDefaultEndpoint(bestId,1); pc.SetDefaultEndpoint(bestId,2);
    IDev bd; en.GetDevice(bestId,out bd); UnmuteDev(bd);
    return "{\"ok\":true,\"name\":\""+Esc(bestName)+"\"}";
  }
  public static void Unmute(){
    var en=(IEnum)(new MMEnum()); IDev d; en.GetDefaultAudioEndpoint(1,0,out d); UnmuteDev(d);
  }
}
'@

switch ($Action) {
  "list"    { [NishroAudio]::List() }
  "default" { if ($Id) { [NishroAudio]::SetDefault($Id) } else { '{"ok":false}' } }
  "auto"    { [NishroAudio]::Auto() }
  "unmute"  { [NishroAudio]::Unmute(); '{"ok":true}' }
  default   { [NishroAudio]::List() }
}
