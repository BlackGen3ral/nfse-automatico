package com.artho.nfseconecta;
public final class ClapDetector {
 private final boolean pocket;
 public ClapDetector(){this(false);}
 public ClapDetector(boolean pocket){this.pocket=pocket;}
 private double noise=.008;private long burst=-1,quiet=-1,first=-1,last=-10000,cooldown;private boolean rejected;
 public void reset(long until){burst=-1;quiet=-1;first=-1;cooldown=until;rejected=false;}
 public boolean frame(short[] data,int count,long now){
  if(count<=0||now<cooldown)return false;
  double sum=0,difference=0,peak=0;for(int i=0;i<count;i++){double x=data[i]/32768.0;sum+=x*x;peak=Math.max(peak,Math.abs(x));if(i>0){double d=(data[i]-data[i-1])/32768.0;difference+=d*d;}}
  double rms=Math.sqrt(sum/count),edge=Math.sqrt(difference/count);
  boolean impulse=peak>(pocket?.20:.42)&&rms>Math.max(pocket?.023:.045,noise*(pocket?5:4.5))&&peak>rms*2.1&&edge>rms*(pocket?.22:.45);
  boolean loud=rms>Math.max(.025,noise*2.8);
  if(!loud||(burst<0&&!impulse))noise=noise*.98+rms*.02;
  if(impulse&&burst<0&&now-last>180){burst=now;quiet=-1;rejected=false;}
  if(burst>=0){
   if(loud){quiet=-1;if(now-burst>140)rejected=true;}
   else {if(quiet<0)quiet=now;if(now-quiet>=70){
    long at=burst;boolean valid=!rejected&&at-last>=180;burst=-1;last=at;
    if(valid){if(first>=0&&at-first>=230&&at-first<=900){first=-1;cooldown=now+15000;return true;}first=at;}
   }}
  }
  if(first>=0&&now-first>1100)first=-1;return false;
 }
}

