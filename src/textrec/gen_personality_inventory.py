import click
import random
import sys
import json
random.seed(0)

personality_data = {
    "NFC": [[ # https://ipip.ori.org/newSingleConstructsKey.htm#Need-for-Cognition
        "Like to solve complex problems.",
        "Need things explained only once.",
        "Can handle a lot of information.",
        "Love to think up new ways of doing things.",
        "Am quick to understand things.",
        "Love to read challenging material."
    ], [
        "Have difficulty understanding abstract ideas.",
        "Try to avoid complex people.",
        "Avoid difficult reading material.",
        "Avoid philosophical discussions."
    ]],
    "Openness": [[ # 10-item NEO scale, https://ipip.ori.org/newNEOKey.htm#Openness-to-Experience
        "Believe in the importance of art.",
        "Have a vivid imagination.",
        "Tend to vote for liberal political candidates.",
        "Carry the conversation to a higher level.",
        "Enjoy hearing new ideas.",
    ], [
        "Am not interested in abstract ideas.",
        "Do not like art.",
        "Avoid philosophical discussions.",
        "Do not enjoy going to art museums.",
        "Tend to vote for conservative political candidates.",
    ]],
    "Extraversion": [[ # 10-item NEO, https://ipip.ori.org/newNEOKey.htm#Extraversion
        "Feel comfortable around people.",
        "Make friends easily.",
        "Am skilled in handling social situations.",
        "Am the life of the party.",
        "Know how to captivate people.",
    ], [
        "Have little to say.",
        "Keep in the background.",
        "Would describe my experiences as somewhat dull.",
        "Don't like to draw attention to myself.",
        "Don't talk a lot.",
    ]],
    "Neuroticism": [[ # https://ipip.ori.org/newNEOKey.htm#Neuroticism
        "Often feel blue.",
        "Dislike myself.",
        "Am often down in the dumps.",
        "Have frequent mood swings.",
        "Panic easily.",
    ], [
        "Rarely get irritated.",
        "Seldom feel blue.",
        "Feel comfortable with myself.",
        "Am not easily bothered by things.",
        "Am very pleased with myself. ",
    ]],
    "Trust": [[ # https://ipip.ori.org/newNEOKey.htm#Trust
        "I trust others",
        "I believe that others have good intentions",
        "I trust what people say",
        "I believe that people are basically moral",
        "I believe in human goodness",
        "I think that all will be well",
    ], [
        "I distrust people",
        "I suspect hidden motives in others",
        "I am wary of others",
        "I believe that people are essentially evil",
    ]]
}


def grammaticalize(item):
    if item.startswith("I "):
        return item
    return "I " + item[0].lower() + item[1:]


def gen_invertory_internal(traits_to_use):
    # Desired ordering:
    # - Cycle through traits
    # - Alternate positive and negative
    items = [
        dict(
            trait=trait,
            is_negated=pn_idx,
            trait_idx=trait_idx,
            item_idx=item_idx,
            item=grammaticalize(item))
        for trait_idx, trait in enumerate(traits_to_use)
        for pn_idx, posneg in enumerate(personality_data[trait])
        for item_idx, item in enumerate(posneg)
    ]
    # Each batch should have:
    #  an even division between traits
    #  for each trait, an even division of positive and negative
    return sorted(items, key=lambda x: (x['item_idx'], x['trait_idx'], x['is_negated'], random.random()))


@click.command()
@click.option('--trait', multiple=True, type=click.Choice(list(personality_data.keys())))
@click.option('--export-name', default='')
@click.option('--out', type=click.File(mode='w'), default='-')
def gen_inventory(trait, export_name, out):
    items = gen_invertory_internal(trait)
    if export_name:
        out.write(f"// AUTO-GENERATED\nexport const {export_name} = ")
    json.dump(items, out, indent=2)
    if export_name:
        out.write(f";\nexport default {export_name};\n")
        print(f"{len(items)} trait items written", file=sys.stderr)

if __name__ == '__main__':
    gen_inventory()
