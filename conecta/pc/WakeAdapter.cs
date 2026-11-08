using System;
using System.Collections.Generic;
using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Drawing;
using System.Windows.Forms;

internal sealed class WakeAdapter {
 public string Id,Name,Mac,Broadcast;
 public override string ToString(){return Name;}
 public static List<WakeAdapter> Available(){
  var result=new List<WakeAdapter>();
  foreach(var adapter in NetworkInterface.GetAllNetworkInterfaces()){
   if(adapter.OperationalStatus!=OperationalStatus.Up || adapter.NetworkInterfaceType!=NetworkInterfaceType.Ethernet)continue;
   var mac=adapter.GetPhysicalAddress().GetAddressBytes();
   if(mac.Length!=6 || (mac[0]&1)!=0)continue;
   var properties=adapter.GetIPProperties();
   foreach(var address in properties.UnicastAddresses){
    if(address.Address.AddressFamily!=AddressFamily.InterNetwork || address.IPv4Mask==null)continue;
    var ip=address.Address.GetAddressBytes();var mask=address.IPv4Mask.GetAddressBytes();
    if(!(ip[0]==10 || ip[0]==172&&ip[1]>=16&&ip[1]<=31 || ip[0]==192&&ip[1]==168))continue;
    if(mask.Length!=4 || mask[3]==255)continue;
    var broadcast=new byte[4];for(int i=0;i<4;i++)broadcast[i]=(byte)(ip[i]|(~mask[i]&255));
    result.Add(new WakeAdapter{Id=adapter.Id,Name=adapter.Description,Mac=BitConverter.ToString(mac).Replace("-",":"),Broadcast=new IPAddress(broadcast).ToString()});break;
   }
  }return result;
 }
 public static WakeAdapter Configure(Form owner,string selected,bool start,out bool autoStart){
  autoStart=start;var candidates=Available();
  if(candidates.Count==0){MessageBox.Show(owner,"Conecte este PC por cabo a uma rede local e tente novamente.","Ligar pela rede");return null;}
  using(var form=new Form{Text="Ligar PC pela rede",ClientSize=new Size(470,300),FormBorderStyle=FormBorderStyle.FixedDialog,StartPosition=FormStartPosition.CenterParent,MaximizeBox=false,MinimizeBox=false,Font=new Font("Segoe UI",10),BackColor=Color.FromArgb(245,251,247)}){
   form.Controls.Add(new Label{Text="Adaptador conectado por cabo",Location=new Point(20,20),AutoSize=true});
   var list=new ComboBox{Location=new Point(20,50),Size=new Size(430,30),DropDownStyle=ComboBoxStyle.DropDownList};foreach(var item in candidates)list.Items.Add(item);
   list.SelectedIndex=Math.Max(0,candidates.FindIndex(item=>item.Id==selected));form.Controls.Add(list);
   var startup=new CheckBox{Text="Iniciar o Conecta ao entrar no Windows",Checked=start,Location=new Point(20,100),AutoSize=true};form.Controls.Add(startup);
   form.Controls.Add(new Label{Text="No celular, use Ligar PC estando no mesmo Wi-Fi.\nO PC precisa de Wake-on-LAN ativado na BIOS e no driver.\nO acesso de outra rede depende de configuração adicional.\nApós iniciar, o Windows precisa entrar na sua conta.",Location=new Point(20,140),Size=new Size(430,85)});
   var save=new Button{Text="Salvar configuração",Location=new Point(235,245),Size=new Size(215,36),DialogResult=DialogResult.OK};form.Controls.Add(save);form.AcceptButton=save;
   if(form.ShowDialog(owner)!=DialogResult.OK)return null;
   autoStart=startup.Checked;return (WakeAdapter)list.SelectedItem;
  }
 }
}

