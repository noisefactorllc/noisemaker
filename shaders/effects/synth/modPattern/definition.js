import { Effect } from '../../../src/runtime/effect.js'

export default new Effect({
	name: "Mod Pattern",
	namespace: "synth",
	func: "modPattern",
	description: "Interference patterns from modulo operations",
	tags: ["geometric", "pattern"],

	uniformLayout: {
		resolution: { slot: 0, components: "xy" },
		time: { slot: 0, components: "z" },
		shape1: { slot: 1, components: "x" },
		scale1: { slot: 1, components: "y" },
		repeat1: { slot: 1, components: "z" },
		shape2: { slot: 1, components: "w" },
		scale2: { slot: 2, components: "x" },
		repeat2: { slot: 2, components: "y" },
		shape3: { slot: 2, components: "z" },
		scale3: { slot: 2, components: "w" },
		repeat3: { slot: 3, components: "x" },
		blend3: { slot: 3, components: "y" },
		speed: { slot: 3, components: "z" }
	},

	globals: {
		shape1: {
			type: "int",
			default: 0,
			min: 0,
			max: 2,
			choices: {
				plus: 0,
				square: 1,
				diamond: 2
			},
			uniform: "shape1",
			ui: {

			    label: "shape1",category: "layer 1",
			}
		},
		scale1: {
			type: "float",
			default: 18.0,
			min: 0.1,
			max: 20,
			randMin: 10.0,
			randMax: 18.0,
			uniform: "scale1",
			ui: {

			    label: "scale1",category: "layer 1",
			}
		},
		repeat1: {
			type: "float",
			default: 5.0,
			min: 0,
			max: 20,
			randMin: 3.0,
			uniform: "repeat1",
			ui: {

			    label: "repeat1",category: "layer 1",
			}
		},
		shape2: {
			type: "int",
			default: 1,
			min: 0,
			max: 2,
			choices: {
				plus: 0,
				square: 1,
				diamond: 2
			},
			uniform: "shape2",
			ui: {

			    label: "shape2",category: "layer 2",
			}
		},
		scale2: {
			type: "float",
			default: 8.0,
			min: 0.1,
			max: 10,
			randMin: 5.0,
			uniform: "scale2",
			ui: {

			    label: "scale2",category: "layer 2",
			}
		},
		repeat2: {
			type: "float",
			default: 8.0,
			min: 0,
			max: 10,
			randMax: 8.0,
			uniform: "repeat2",
			ui: {

			    label: "repeat2",category: "layer 2",
			}
		},
		shape3: {
			type: "int",
			default: 2,
			min: 0,
			max: 2,
			choices: {
				plus: 0,
				square: 1,
				diamond: 2
			},
			uniform: "shape3",
			ui: {

			    label: "shape3",category: "layer 3",
			}
		},
		scale3: {
			type: "float",
			default: 1.5,
			min: 0.1,
			max: 20,
			randMax: 6.0,
			uniform: "scale3",
			ui: {

			    label: "scale3",category: "layer 3",
			}
		},
		repeat3: {
			type: "float",
			default: 1.5,
			min: 0,
			max: 5,
			randMax: 3.0,
			uniform: "repeat3",
			ui: {

			    label: "repeat3",category: "layer 3",
			}
		},
		blend3: {
			type: "int",
			default: 0,
			min: 0,
			max: 3,
			choices: {
				add: 0,
				max: 1,
				mix: 2,
				rgb: 3
			},
			uniform: "blend3",
			ui: {
				label: "blend mode",
				category: "layer 3",
			}
		},
		speed: {
			type: "int",
			default: 1,
			min: 0,
			max: 5,
			randMax: 1,
			uniform: "speed",
			ui: {

			    label: "speed",category: "layer 3",
			}
		}
	},
	passes: [
		{
			name: "main",
			program: "modPattern",
			inputs: {},
			outputs: {
				fragColor: "outputTex"
			}
		}
	]
})