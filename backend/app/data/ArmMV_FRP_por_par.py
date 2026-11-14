"""Armonización exploratoria NASA FIRMS MODIS C6.1 + VIIRS J1/J2 C2.
Instalar: pip install -r requirements.txt (desde backend/)
Ejecutar: python -m app.data.ArmMV_FRP_por_par --horas 24 --superposicion 20
Los rectángulos scan/track están alineados E-O/N-S (NO son huellas reales).
"""
import argparse
from pathlib import Path
import csv
import numpy as np
import pandas as pd
from scipy.spatial import cKDTree
from pyproj import Geod

ARCHIVOS = [('MODIS','MODIS_C6_1_Global_7d.csv'), ('J1','J1_VIIRS_C2_Global_7d.csv'), ('J2','J2_VIIRS_C2_Global_7d.csv')]
COLS_PARES = ['id_modis','id_viirs','satelite_modis','satelite_viirs','fecha_modis_utc','fecha_viirs_utc','diferencia_horas','lat_modis','lon_modis','lat_viirs','lon_viirs','distancia_centros_m','area_interseccion_m2','superposicion_viirs_pct','superposicion_modis_pct','frp_modis_mw','frp_viirs_mw','frp_suma_par_mw','confianza_modis_original','confianza_viirs_original']

def leer(ruta, sensor):
    df = pd.read_csv(ruta, low_memory=False)
    req = {'latitude','longitude','scan','track','acq_date','acq_time','frp','satellite','confidence'}
    if not req.issubset(df.columns):
        raise ValueError(f'{ruta.name}: faltan {sorted(req-set(df.columns))}')
    df = df.copy()
    for c in ['latitude','longitude','scan','track','frp']:
        df[c] = pd.to_numeric(df[c], errors='coerce')
    hora = pd.to_numeric(df['acq_time'],errors='coerce').astype('Int64').astype('string').str.zfill(4)
    df['fecha_utc'] = pd.to_datetime(df['acq_date'].astype('string')+' '+hora.str[:2]+':'+hora.str[2:], utc=True, errors='coerce')
    df['scan_m'] = df['scan']*1000
    df['track_m'] = df['track']*1000
    df['instrumento'] = 'MODIS' if sensor=='MODIS' else 'VIIRS'
    df['fuente'] = sensor
    df['id_observacion'] = sensor+'_'+df.index.astype(str)
    df['confianza_original'] = df['confidence'].astype('string')
    valid = (df['latitude'].between(-90,90)&df['longitude'].between(-180,180)&
             df['scan_m'].gt(0)&df['track_m'].gt(0)&df['frp'].ge(0)&df['fecha_utc'].notna())
    print(f'{sensor}: {len(df):,} filas; inválidas descartadas: {(~valid).sum():,}',flush=True)
    return df.loc[valid].reset_index(drop=True)

def xyz(df):
    lat=np.deg2rad(df['latitude'].to_numpy(dtype=float))
    lon=np.deg2rad(df['longitude'].to_numpy(dtype=float))
    return np.column_stack((np.cos(lat)*np.cos(lon),np.cos(lat)*np.sin(lon),np.sin(lat)))

def main():
    p=argparse.ArgumentParser(description=__doc__)
    carpeta_datos=Path(__file__).resolve().parent
    p.add_argument('--carpeta',type=Path,default=carpeta_datos,help='Carpeta con los 3 CSV')
    p.add_argument('--salida',type=Path,default=None,help='Carpeta de salida (por defecto, data/resultados_armonizacion)')
    p.add_argument('--horas',type=float,default=24)
    p.add_argument('--superposicion',type=float,default=20,help='Porcentaje mínimo de VIIRS dentro de MODIS; 0 permite toda intersección positiva')
    p.add_argument('--lote',type=int,default=500)
    a=p.parse_args()
    if not (0<=a.superposicion<=100) or a.horas<0 or a.lote<1: p.error('Parámetros inválidos')
    base=a.carpeta.resolve(); out=(a.salida or base/'resultados_armonizacion').resolve();out.mkdir(parents=True,exist_ok=True)
    datos=[]
    for sensor,nombre in ARCHIVOS:
        ruta=base/nombre
        if not ruta.exists():p.error(f'No existe {ruta}')
        datos.append(leer(ruta,sensor))
    m=datos[0];v=pd.concat(datos[1:],ignore_index=True)
    norm=pd.concat(datos,ignore_index=True)
    norm.to_csv(out/'observaciones_normalizadas.csv',index=False)
    print('Guardadas observaciones normalizadas:',len(norm),flush=True)
    del norm,datos
    # KDTree en coordenadas esféricas 3D: sin problemas con antimeridiano.
    # Radio conservador basado en diagonales máximas de ambas huellas.
    r_m=np.hypot(m['scan_m'],m['track_m']).max()/2
    r_v=np.hypot(v['scan_m'],v['track_m']).max()/2
    radio_m=r_m+r_v+10
    radio_cuerda=2*np.sin((radio_m/6371000)/2)
    tree=cKDTree(xyz(v))
    pos_m=xyz(m)
    geod=Geod(ellps='WGS84')
    vm_lat=v['latitude'].to_numpy();vm_lon=v['longitude'].to_numpy()
    vs=v['scan_m'].to_numpy();vt=v['track_m'].to_numpy();vf=v['frp'].to_numpy()
    vtime=v['fecha_utc'].to_numpy(dtype='datetime64[ns]')
    mtime=m['fecha_utc'].to_numpy(dtype='datetime64[ns]')
    mi=m['id_observacion'].to_numpy();vi=v['id_observacion'].to_numpy()
    msat=m['satellite'].astype(str).to_numpy();vsat=v['satellite'].astype(str).to_numpy()
    mconf=m['confianza_original'].astype(str).to_numpy();vconf=v['confianza_original'].astype(str).to_numpy()
    mlat=m['latitude'].to_numpy();mlon=m['longitude'].to_numpy()
    mscan=m['scan_m'].to_numpy();mtrack=m['track_m'].to_numpy();mfrp=m['frp'].to_numpy()
    n=len(m);counts=np.zeros(n,dtype=np.int64);sums=np.zeros(n);seen=set();pairs_count=0
    f=open(out/'coincidencias_modis_viirs.csv','w',newline='',encoding='utf-8')
    writer=csv.writer(f);writer.writerow(COLS_PARES)
    try:
        for start in range(0,n,a.lote):
            end=min(start+a.lote,n)
            neighbors=tree.query_ball_point(pos_m[start:end],r=radio_cuerda,workers=-1)
            for off,js in enumerate(neighbors):
                i=start+off
                if not js:continue
                js=np.asarray(js,dtype=np.int64)
                dt=np.abs(vtime[js]-mtime[i])/np.timedelta64(1,'h')
                js=js[dt<=a.horas]
                if len(js)==0:continue
                az,_,dist=geod.inv(np.full(len(js),mlon[i]),np.full(len(js),mlat[i]),vm_lon[js],vm_lat[js])
                # Plano tangente local: azimut medido desde norte, x=este, y=norte
                rad=np.deg2rad(az)
                dx=dist*np.sin(rad);dy=dist*np.cos(rad)
                # Intersección de rectángulos alineados a los ejes locales
                lx=np.maximum(0,np.minimum(mscan[i]/2,dx+vs[js]/2)-np.maximum(-mscan[i]/2,dx-vs[js]/2))
                ly=np.maximum(0,np.minimum(mtrack[i]/2,dy+vt[js]/2)-np.maximum(-mtrack[i]/2,dy-vt[js]/2))
                area=lx*ly
                frac=area/(vs[js]*vt[js])
                good=(area>0)&(frac>=a.superposicion/100)
                for j,d,ar,pct,delta in zip(js[good],dist[good],area[good],frac[good],np.abs(vtime[js[good]]-mtime[i])/np.timedelta64(1,'h')):
                    writer.writerow([mi[i],vi[j],msat[i],vsat[j],str(m['fecha_utc'].iat[i]),str(v['fecha_utc'].iat[j]),round(float(delta),4),mlat[i],mlon[i],vm_lat[j],vm_lon[j],round(float(d),2),round(float(ar),2),round(float(pct*100),3),round(float(ar/(mscan[i]*mtrack[i])*100),3),mfrp[i],vf[j],round(float(mfrp[i]+vf[j]),4),mconf[i],vconf[j]])
                    counts[i]+=1;sums[i]+=vf[j];seen.add(int(j));pairs_count+=1
            if (end%5000<a.lote) or end==n:
                print(f'Procesados MODIS: {end:,}/{n:,} | pares: {pairs_count:,}',flush=True)
    finally:f.close()
    resumen=pd.DataFrame({'id_modis':mi,'fecha_modis_utc':m['fecha_utc'],'latitude':mlat,'longitude':mlon,'frp_modis_mw':mfrp,'n_coincidencias_viirs':counts,'frp_viirs_suma_por_modis_mw':np.where(counts>0,sums,np.nan)})
    resumen.to_csv(out/'resumen_por_modis.csv',index=False)
    matched=counts>0
    vu=np.array(sorted(seen),dtype=int)
    resumen_general=pd.DataFrame([{
        'modis_total':n,
        'viirs_total':len(v),
        'pares_coincidentes':pairs_count,
        'modis_con_coincidencias':int(matched.sum()),
        'viirs_unicos_coincidentes':len(vu),
        'ventana_horas':a.horas,
        'superposicion_min_viirs_pct':a.superposicion
    }])
    resumen_general.to_csv(out/'resumen_general.csv',index=False)
    print('\nRESUMEN FINAL\n'+resumen_general.to_string(index=False),flush=True)
    print('\nTABLA DE FRP POR PAR (primeros 20; tabla completa en coincidencias_modis_viirs.csv):')
    columnas_tabla=['id_modis','id_viirs','diferencia_horas','frp_modis_mw','frp_viirs_mw','frp_suma_par_mw']
    tabla=pd.read_csv(out/'coincidencias_modis_viirs.csv',usecols=columnas_tabla,nrows=20)
    print(tabla.to_string(index=False) if len(tabla) else 'No se encontraron pares.',flush=True)
    print('\nArchivos en:',out,flush=True)
    print('ADVERTENCIA: coincidencia espacial y temporal no implica mismo incendio; FRP no está calibrado entre sensores.',flush=True)

if __name__=='__main__':main()
