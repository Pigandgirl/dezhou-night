import bpy, math, os
bpy.ops.wm.read_factory_settings(use_empty=True)
scene=bpy.context.scene

def mat(name,color,metal=0.1,rough=0.45):
    m=bpy.data.materials.new(name); m.use_nodes=True; bsdf=m.node_tree.nodes.get('Principled BSDF'); bsdf.inputs['Base Color'].default_value=(*color,1); bsdf.inputs['Metallic'].default_value=metal; bsdf.inputs['Roughness'].default_value=rough; return m

red=mat('ChipRed',(0.55,0.04,0.04),0.15,0.35)
gold=mat('ChipGold',(0.65,0.42,0.12),0.65,0.25)
black=mat('ChipBlack',(0.015,0.02,0.025),0.2,0.4)
for i in range(7):
    bpy.ops.mesh.primitive_cylinder_add(vertices=40, radius=0.095, depth=0.022, location=(0,0,0.011+i*0.023))
    ob=bpy.context.object
    ob.name=f'PokerChip_{i}'
    ob.data.materials.append(red if i%3==0 else (gold if i%3==1 else black))
    bevel=ob.modifiers.new('bevel','BEVEL'); bevel.width=0.004; bevel.segments=2
# dealer button small gold ring
bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=0.06, depth=0.012, location=(0.24,0.02,0.006))
ob=bpy.context.object; ob.name='DealerButton'; ob.data.materials.append(gold)
for o in list(scene.objects):
    o.select_set(False)
for o in scene.objects: o.select_set(True)
bpy.ops.export_scene.gltf(filepath=os.path.abspath('public/models/kenney/poker-props.glb'), export_format='GLB', use_selection=True, export_apply=True)
print('exported')
