import { Euler, Vector3 } from 'three';

// 归一化后的船首朝 −Z，船顶朝 +Y。机头反向时把第二个 0 改为 Math.PI。
export const SHIP_ROTATION_OFFSET = new Euler(0, 0, 0);
// 左、右喷口的备用挂点，单位为归一化后的飞船局部坐标，+Z 为喷流方向。
// GLB 内名为 Thruster_L / Thruster_R 的节点优先，可跟随骨骼或发动机动画。
export const THRUSTER_OFFSETS = [new Vector3(-.074,.005,.202), new Vector3(.074,.005,.202)];
export const WINGTIP_OFFSETS = [new Vector3(-.229,.006,.14), new Vector3(.229,.006,.14)];
export const STATION_ROTATION_OFFSET = new Euler(0, 0, 0);

export const SHIP_LENGTH = .50;
export const STATION_SPAN = 2.58;
// 实体舱口中心，正前方 .37 个单位处是游戏原有的青色引导圈。
export const PORT_FACE = new Vector3(0,0,.37);
