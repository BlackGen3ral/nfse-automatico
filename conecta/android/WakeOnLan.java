package com.artho.nfseconecta;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;

public final class WakeOnLan {
 public static byte[] packet(String mac){
  if(mac==null || !mac.matches("(?i)([0-9a-f]{2}:){5}[0-9a-f]{2}"))throw new IllegalArgumentException("Endereço do adaptador inválido.");
  String[] parts=mac.split(":");byte[] address=new byte[6];
  for(int i=0;i<6;i++)address[i]=(byte)Integer.parseInt(parts[i],16);
  boolean zero=true;for(byte b:address)zero&=b==0;
  if(zero || (address[0]&1)!=0)throw new IllegalArgumentException("Endereço do adaptador inválido.");
  byte[] packet=new byte[102];for(int i=0;i<6;i++)packet[i]=(byte)255;
  for(int i=6;i<102;i++)packet[i]=address[(i-6)%6];return packet;
 }
 public static InetAddress destination(String broadcast)throws Exception{
  if(broadcast==null || !broadcast.matches("[0-9]{1,3}(\\.[0-9]{1,3}){3}"))throw new IllegalArgumentException("Rede local inválida.");
  String[] parts=broadcast.split("\\.");int[] ip=new int[4];byte[] bytes=new byte[4];
  for(int i=0;i<4;i++){ip[i]=Integer.parseInt(parts[i]);if(ip[i]>255)throw new IllegalArgumentException("Rede local inválida.");bytes[i]=(byte)ip[i];}
  if(!(ip[0]==10 || ip[0]==172&&ip[1]>=16&&ip[1]<=31 || ip[0]==192&&ip[1]==168))throw new IllegalArgumentException("Use o Wi-Fi da mesma rede do PC.");
  return InetAddress.getByAddress(bytes);
 }
 public static void send(android.net.Network network,String mac,String broadcast)throws Exception{
  byte[] bytes=packet(mac);InetAddress target=destination(broadcast);
  try(DatagramSocket socket=new DatagramSocket()){
   network.bindSocket(socket);socket.setBroadcast(true);
   for(int i=0;i<3;i++){socket.send(new DatagramPacket(bytes,bytes.length,target,9));if(i<2)Thread.sleep(150);}
  }
 }
}

