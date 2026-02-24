import { BaseTool, ToolResult, ToolExecutionContext } from "./base-tool.js";
import { getEnabledSkills, loadSkillsSettings, Skill } from "../skills-store.js";
import { 
  readSkillContent, 
  listSkillFiles, 
  getSkillPath
} from "../skills-loader.js";

export const SkillsToolDefinition = {
  type: "function" as const,
  function: {
    name: "load_skill",
    description: `Load a skill to get instructions and discover available scripts.
Use this when you need to perform a specialized task and want to follow best practices.
Skills provide step-by-step instructions and ready-to-run scripts.

Available operations:
- "get": Get the full SKILL.md content with instructions
- "list_files": List all files in the skill directory
- "list_available": List all enabled skills

IMPORTANT: Do not read skill script source code. Execute scripts directly via bash.`,
    parameters: {
      type: "object" as const,
      properties: {
        operation: {
          type: "string",
          enum: ["get", "list_files", "list_available"],
          description: "The operation to perform"
        },
        skill_id: {
          type: "string",
          description: "The skill identifier (required for get, list_files)"
        }
      },
      required: ["operation"]
    }
  }
};

export class SkillsTool extends BaseTool {
  name = "load_skill";
  
  get definition() {
    return SkillsToolDefinition;
  }
  
  async execute(
    args: { 
      operation: "get" | "list_files" | "list_available";
      skill_id?: string;
    },
    context: ToolExecutionContext
  ): Promise<ToolResult> {
    const cwd = context.cwd; // Pass cwd to download skills to workspace
    
    try {
      switch (args.operation) {
        case "list_available":
          return this.listAvailableSkills();
          
        case "get":
          if (!args.skill_id) {
            return { success: false, error: "skill_id is required for 'get' operation" };
          }
          return this.getSkill(args.skill_id, cwd);
          
        case "list_files":
          if (!args.skill_id) {
            return { success: false, error: "skill_id is required for 'list_files' operation" };
          }
          return this.listSkillFiles(args.skill_id, cwd);
          
        default:
          return { success: false, error: `Unknown operation: ${args.operation}. Use "get", "list_files", or "list_available".` };
      }
    } catch (error: any) {
      return {
        success: false,
        error: `Skill operation failed: ${error.message}`
      };
    }
  }
  
  private listAvailableSkills(): ToolResult {
    const enabledSkills = getEnabledSkills();
    
    if (enabledSkills.length === 0) {
      return {
        success: true,
        output: "No skills are currently enabled. Ask the user to enable skills in Settings > Skills."
      };
    }
    
    const skillsList = enabledSkills.map((skill: Skill) => 
      `- **${skill.name}**: ${skill.description}${skill.category ? ` [${skill.category}]` : ""}`
    ).join("\n");
    
    return {
      success: true,
      output: `## Enabled Skills (${enabledSkills.length})\n\n${skillsList}\n\nUse \`load_skill\` with operation "get" and the skill_id to load detailed instructions.`
    };
  }
  
  private async getSkill(skillId: string, cwd?: string): Promise<ToolResult> {
    // Check if skill is enabled
    const enabledSkills = getEnabledSkills();
    const skill = enabledSkills.find((s: Skill) => s.id === skillId);
    
    if (!skill) {
      const settings = loadSkillsSettings();
      const allSkill = settings.skills.find((s: Skill) => s.id === skillId);
      
      if (allSkill) {
        return {
          success: false,
          error: `Skill "${skillId}" exists but is not enabled. Ask the user to enable it in Settings > Skills.`
        };
      }
      
      return {
        success: false,
        error: `Skill "${skillId}" not found. Use operation "list_available" to see enabled skills.`
      };
    }
    
    try {
      // Pass cwd to download skill to workspace/.valera/skills/
      const content = await readSkillContent(skillId, cwd);
      const skillDir = await getSkillPath(skillId, cwd);
      
      return {
        success: true,
        output: `## Skill: ${skill.name}\n\n**Skill directory:** \`${skillDir}\`\n\n` +
          `Important: resolve all relative paths in this skill (scripts/, references/, config/) ` +
          `relative to this skill directory, not the user's working directory.\n\n${content}`
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to load skill content: ${error.message}`
      };
    }
  }
  
  private async listSkillFiles(skillId: string, cwd?: string): Promise<ToolResult> {
    const enabledSkills = getEnabledSkills();
    const skill = enabledSkills.find((s: Skill) => s.id === skillId);
    
    if (!skill) {
      return {
        success: false,
        error: `Skill "${skillId}" is not enabled or not found.`
      };
    }
    
    try {
      const files = await listSkillFiles(skillId, cwd);
      const skillDir = await getSkillPath(skillId, cwd);
      
      const filesList = files.map((f: string) => `- ${f}`).join("\n");
      
      return {
        success: true,
        output: `## Files in skill "${skillId}":\n\n**Skill directory:** \`${skillDir}\`\n\n${filesList}\n\n` +
          `Execute scripts directly via bash:\n\`\`\`bash\ncd ${skillDir} && python scripts/<script_name>.py [args]\n\`\`\`\n\n` +
          `Resolve relative paths from \`${skillDir}\`, not from the user's working directory.`
      };
    } catch (error: any) {
      return {
        success: false,
        error: `Failed to list skill files: ${error.message}`
      };
    }
  }
  
}

/**
 * Generate skills context for system prompt.
 * `cwd` is passed for API parity with caller and future use.
 */
export function generateSkillsPromptSection(_cwd?: string): string {
  const enabledSkills = getEnabledSkills();
  
  if (enabledSkills.length === 0) {
    return "";
  }
  
  const skillsList = enabledSkills.map((skill: Skill) => 
    `- **${skill.name}**: ${skill.description}`
  ).join("\n");
  
  return `
## Available Skills

You have access to specialized skills that provide detailed instructions for specific tasks.
When a task matches one of these skills, use the \`load_skill\` tool to get step-by-step guidance.

### Enabled Skills:
${skillsList}

### How to use skills:
1. When you recognize a task that matches a skill, call \`load_skill\` with operation "get" and the skill_id
2. Follow the instructions in the skill's SKILL.md
3. Use operation "list_files" to see available scripts and references
4. Do not read skill script source code; execute scripts directly via \`bash\`
5. Resolve relative paths from the skill directory shown in tool output, not from the user's working directory

Skills help you follow best practices and produce consistent, high-quality results.
`;
}
