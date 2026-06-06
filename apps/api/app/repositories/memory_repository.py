from app.domain.models import Chapter, Character, Event, Relationship, Scene, Workspace


class MemoryRepository:
    def get_workspace(self) -> Workspace:
        return Workspace(
            chapters=[
                Chapter(
                    id="ch-1",
                    title="第一章 茶馆旧影",
                    summary="林舟在茶馆重遇沈青，发现她对旧案避而不谈。",
                    word_count=3680,
                    conflict="林舟试探沈青，沈青拒绝交代昨夜去向。",
                    character_ids=["char-lin", "char-shen", "char-luo"],
                ),
                Chapter(
                    id="ch-2",
                    title="第二章 雨夜证词",
                    summary="罗掌柜透露失踪证人曾被许怀安的人带走。",
                    word_count=4210,
                    conflict="线索浮现，但沈青阻止林舟继续追查。",
                    character_ids=["char-lin", "char-shen", "char-xu", "char-luo"],
                ),
                Chapter(
                    id="ch-3",
                    title="第三章 府门相逼",
                    summary="林舟登门质问许怀安，沈青被迫暴露双重身份。",
                    word_count=4560,
                    conflict="林舟与许怀安正面冲突，沈青立场成谜。",
                    character_ids=["char-lin", "char-shen", "char-xu"],
                ),
            ],
            characters=[
                Character(
                    id="char-lin",
                    name="林舟",
                    aliases=["林公子", "少东家"],
                    importance=96,
                    role="主角",
                    description="表面温和，实际不断追查父亲旧案。",
                    appearances=["ch-1", "ch-2", "ch-3"],
                ),
                Character(
                    id="char-shen",
                    name="沈青",
                    aliases=["阿青"],
                    importance=88,
                    role="关键盟友",
                    description="掌握旧案线索，但始终隐藏真实立场。",
                    appearances=["ch-1", "ch-2", "ch-3"],
                ),
                Character(
                    id="char-xu",
                    name="许怀安",
                    aliases=["许大人"],
                    importance=74,
                    role="反派",
                    description="城中权贵，和多年前的失踪案有关。",
                    appearances=["ch-2", "ch-3"],
                ),
                Character(
                    id="char-luo",
                    name="罗掌柜",
                    aliases=["掌柜"],
                    importance=52,
                    role="线索人物",
                    description="茶馆老板，见过关键证人。",
                    appearances=["ch-1", "ch-2"],
                ),
            ],
            relationships=[
                Relationship(id="rel-1", source="char-lin", target="char-shen", type="暧昧", strength=82),
                Relationship(id="rel-2", source="char-lin", target="char-xu", type="敌对", strength=91),
                Relationship(id="rel-3", source="char-shen", target="char-xu", type="同盟", strength=64),
                Relationship(id="rel-4", source="char-luo", target="char-lin", type="同盟", strength=58),
            ],
            events=[
                Event(
                    id="ev-1",
                    chapter_id="ch-1",
                    title="茶馆重逢",
                    summary="林舟在茶馆发现沈青，二人短暂交锋。",
                    conflict="林舟想确认她是否知情，沈青回避。",
                    character_ids=["char-lin", "char-shen", "char-luo"],
                ),
                Event(
                    id="ev-2",
                    chapter_id="ch-1",
                    title="旧信露出",
                    summary="沈青袖中露出与旧案相关的半封信。",
                    conflict="林舟逼问信件来源，沈青转身离开。",
                    character_ids=["char-lin", "char-shen"],
                ),
                Event(
                    id="ev-3",
                    chapter_id="ch-2",
                    title="罗掌柜作证",
                    summary="罗掌柜说出证人被带走的夜晚。",
                    conflict="证词指向许怀安，却缺少物证。",
                    character_ids=["char-lin", "char-luo"],
                ),
                Event(
                    id="ev-4",
                    chapter_id="ch-3",
                    title="府门对峙",
                    summary="林舟在许府门前逼问许怀安。",
                    conflict="许怀安威胁林舟，沈青出面阻拦。",
                    character_ids=["char-lin", "char-shen", "char-xu"],
                ),
            ],
            scenes=[
                Scene(
                    id="sc-1",
                    title="茶馆试探",
                    location="茶馆",
                    time_of_day="夜",
                    event_ids=["ev-1", "ev-2"],
                    character_ids=["char-lin", "char-shen", "char-luo"],
                    dramatic_function="建立主角关系和旧案悬念",
                ),
                Scene(
                    id="sc-2",
                    title="府门相逼",
                    location="许府门前",
                    time_of_day="雨夜",
                    event_ids=["ev-4"],
                    character_ids=["char-lin", "char-shen", "char-xu"],
                    dramatic_function="升级外部冲突",
                ),
            ],
        )


memory_repository = MemoryRepository()

